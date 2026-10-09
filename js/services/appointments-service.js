// Agendamentos da clínica.
// Fluxo: REQUESTED (paciente pede) -> SCHEDULED (recepção marca) -> CONFIRMED (paciente confirma)
//        -> COMPLETED (realizado) | NO_SHOW | CANCELLED
// Exames realizados ganham resultStatus: IN_ANALYSIS -> READY (pronto para retirada) -> DELIVERED.
//
// Toda alteração é feita em lote (agendamento + histórico + auditoria + aviso ao paciente).
// Consultas só com filtros de igualdade (sem índice composto); ordenação no navegador.
import { db } from "../firebase-config.js";
import {
    doc, collection, getDoc, getDocs, query, where, writeBatch, runTransaction,
    serverTimestamp, Timestamp, getCountFromServer
} from "../lib/firestore.js";
import { buildAppointmentFilePath, uploadFile } from "./storage-service.js";
import { addAudit } from "./audit-service.js";
import { addNotification } from "./notifications-service.js";
import { sortByDate, formatLongDate, formatTime, formatDate, DOCUMENT_TYPES, RESULT_STATUS, userError, onlyDigits } from "../utils.js";

/* ---------- Leitura ---------- */

export async function getAppointment(id) {
    const snapshot = await getDoc(doc(db, "appointments", id));
    return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

export async function listMyAppointments(uid) {
    const snapshot = await getDocs(query(collection(db, "appointments"), where("patientUid", "==", uid)));
    return sortByDate(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })), "createdAt", "desc");
}

export async function listClinicAppointments(clinicId, { status = null, patientId = null } = {}) {
    const filters = [where("clinicId", "==", clinicId)];
    if (status) filters.push(where("status", "==", status));
    if (patientId) filters.push(where("patientId", "==", patientId));
    const snapshot = await getDocs(query(collection(db, "appointments"), ...filters));
    return sortByDate(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })), "createdAt", "desc");
}

export async function listByResultStatus(clinicId, resultStatus) {
    const snapshot = await getDocs(query(
        collection(db, "appointments"),
        where("clinicId", "==", clinicId),
        where("resultStatus", "==", resultStatus)
    ));
    return sortByDate(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })), "completedAt", "asc");
}

export async function countAppointments(clinicId, field, value) {
    const q = query(collection(db, "appointments"), where("clinicId", "==", clinicId), where(field, "==", value));
    return (await getCountFromServer(q)).data().count;
}

export async function listAppointmentDocuments(id) {
    const snapshot = await getDocs(collection(db, "appointments", id, "documents"));
    return sortByDate(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })), "uploadedAt", "asc");
}

export async function listAppointmentHistory(id) {
    const snapshot = await getDocs(collection(db, "appointments", id, "history"));
    return sortByDate(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })), "createdAt", "asc");
}

/* ---------- Auxiliares ---------- */

function historyRef(id) {
    return doc(collection(db, "appointments", id, "history"));
}

function addHistory(batch, appointment, actor, newStatus, reason = "", changedByName = actor.name || "") {
    batch.set(historyRef(appointment.id), {
        previousStatus: appointment.status || null,
        newStatus,
        changedBy: actor.uid,
        changedByName,
        reason,
        createdAt: serverTimestamp()
    });
}

function notifyPatient(batch, appointment, { type, title, message }) {
    addNotification(batch, {
        clinicId: appointment.clinicId,
        userId: appointment.patientUid,
        patientId: appointment.patientId,
        appointmentId: appointment.id,
        type,
        title,
        message
    });
}

function audit(batch, actor, appointment, action, previousData, newData) {
    addAudit(batch, actor, { action, entity: "APPOINTMENT", entityId: appointment.id, patientId: appointment.patientId, previousData, newData });
}

async function generateProtocol(clinicId) {
    const year = new Date().getFullYear();
    const counterRef = doc(db, "counters", `${clinicId}_appointments_${year}`);
    const next = await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(counterRef);
        if (!snapshot.exists()) {
            transaction.set(counterRef, { value: 1, clinicId, updatedAt: serverTimestamp() });
            return 1;
        }
        const value = (snapshot.data().value || 0) + 1;
        transaction.update(counterRef, { value, updatedAt: serverTimestamp() });
        return value;
    });
    return `${year}-${String(next).padStart(6, "0")}`;
}

async function uploadAll({ clinicId, patientId, appointmentId, files }, onProgress) {
    const total = files.reduce((sum, f) => sum + f.file.size, 0) || 1;
    const progress = new Array(files.length).fill(0);
    const uploaded = [];
    for (let i = 0; i < files.length; i++) {
        const { type, file } = files[i];
        const path = buildAppointmentFilePath({ clinicId, patientId, appointmentId, documentType: type, file, index: i });
        await uploadFile(path, file, (sent) => {
            progress[i] = sent;
            onProgress?.(Math.round((progress.reduce((a, b) => a + b, 0) / total) * 100));
        });
        uploaded.push({ type, path, fileName: file.name || path.split("/").pop(), size: file.size, contentType: file.type });
    }
    return uploaded;
}

function documentPayload(item, uid) {
    return {
        type: item.type,
        fileName: item.fileName,
        storagePath: item.path,
        contentType: item.contentType || "",
        size: item.size || 0,
        status: "PENDING",
        uploadedBy: uid,
        uploadedAt: serverTimestamp(),
        reviewedBy: null,
        reviewedAt: null,
        reviewReason: null
    };
}

/* ---------- Paciente ---------- */

// files = [{ type: "MEDICAL_REQUEST", file }, ...]
export async function createAppointmentRequest({ user, profile, patient, service, payment, preferredDate, preferredPeriod, notes, files }, onProgress) {
    if (service.requiresMedicalRequest && !files.some((f) => f.type === "MEDICAL_REQUEST")) {
        throw userError("Envie a foto do pedido médico.");
    }
    const clinicId = profile.clinicId;
    const patientId = profile.patientId;
    const ref = doc(collection(db, "appointments"));

    const protocol = await generateProtocol(clinicId);
    const uploaded = files.length ? await uploadAll({ clinicId, patientId, appointmentId: ref.id, files }, onProgress) : [];

    const batch = writeBatch(db);
    batch.set(ref, {
        clinicId,
        patientId,
        patientUid: user.uid,
        patientName: patient?.name || profile.name || "",
        patientCpf: patient?.cpf || "",
        patientPhone: patient?.phone || "",
        serviceId: service.id,
        serviceName: service.name,
        kind: service.kind,
        specialty: service.specialty || "",
        price: Number(service.price) || 0,
        preparation: service.preparation || "",
        resultDays: Number(service.resultDays) || 0,
        payment: {
            type: payment.type,
            insuranceId: payment.type === "INSURANCE" ? payment.insuranceId : null,
            insuranceName: payment.type === "INSURANCE" ? payment.insuranceName : null,
            cardNumber: payment.type === "INSURANCE" ? String(payment.cardNumber || "").trim() : null
        },
        preferredDate: preferredDate || "",
        preferredPeriod: preferredPeriod || "ANY",
        notes: (notes || "").trim().slice(0, 500),
        protocol,
        status: "REQUESTED",
        scheduledFor: null,
        patientConfirmed: false,
        resultStatus: null,
        requestedAt: serverTimestamp(),
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    });
    uploaded.forEach((item) => batch.set(doc(collection(ref, "documents")), documentPayload(item, user.uid)));
    batch.set(historyRef(ref.id), {
        previousStatus: null,
        newStatus: "REQUESTED",
        changedBy: user.uid,
        changedByName: "Paciente",
        reason: "Pedido enviado pelo aplicativo",
        createdAt: serverTimestamp()
    });
    await batch.commit();
    return { id: ref.id, protocol };
}

// Paciente envia documentos adicionais (ex.: documento recusado) sem mudar o status.
export async function addPatientDocuments({ user, appointment, files }, onProgress) {
    if (!files.length) throw userError("Selecione pelo menos um documento.");
    const uploaded = await uploadAll({ clinicId: appointment.clinicId, patientId: appointment.patientId, appointmentId: appointment.id, files }, onProgress);
    const batch = writeBatch(db);
    uploaded.forEach((item) => batch.set(doc(collection(db, "appointments", appointment.id, "documents")), documentPayload(item, user.uid)));
    await batch.commit();
}

export async function confirmPresence({ user, appointment }) {
    if (appointment.status !== "SCHEDULED") throw userError("Este agendamento não está aguardando confirmação.");
    const batch = writeBatch(db);
    batch.update(doc(db, "appointments", appointment.id), { status: "CONFIRMED", patientConfirmed: true, updatedAt: serverTimestamp() });
    addHistory(batch, appointment, { uid: user.uid }, "CONFIRMED", "Paciente confirmou presença", "Paciente");
    await batch.commit();
}

export async function cancelByPatient({ user, appointment, reason }) {
    const batch = writeBatch(db);
    batch.update(doc(db, "appointments", appointment.id), {
        status: "CANCELLED",
        cancelReason: reason,
        cancelledBy: user.uid,
        cancelledAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    });
    addHistory(batch, appointment, { uid: user.uid }, "CANCELLED", `Cancelado pelo paciente: ${reason}`, "Paciente");
    await batch.commit();
}

/* ---------- Recepção / clínica ---------- */

// Marca (ou remarca) o horário. Para remarcar, o paciente precisa confirmar de novo.
export async function scheduleAppointment({ appointment, actor, scheduledFor, professional, location, instructions }) {
    if (!(scheduledFor instanceof Date) || Number.isNaN(scheduledFor.getTime())) throw userError("Informe data e horário válidos.");
    if (scheduledFor.getTime() < Date.now() - 60000) throw userError("A data escolhida já passou.");
    if (!["REQUESTED", "SCHEDULED", "CONFIRMED"].includes(appointment.status)) throw userError("Este agendamento não pode mais ser marcado.");

    const when = Timestamp.fromDate(scheduledFor);
    const rescheduling = appointment.status !== "REQUESTED";
    const batch = writeBatch(db);
    batch.update(doc(db, "appointments", appointment.id), {
        status: "SCHEDULED",
        scheduledFor: when,
        professional: (professional || "").trim(),
        location: (location || "").trim(),
        instructions: (instructions || "").trim(),
        patientConfirmed: false,
        rescheduleRequested: false,
        scheduledBy: actor.uid,
        updatedAt: serverTimestamp()
    });
    const label = `${formatLongDate(when)} às ${formatTime(when)}`;
    addHistory(batch, appointment, actor, "SCHEDULED", `${rescheduling ? "Remarcado" : "Agendado"} para ${label}`);
    audit(batch, actor, appointment, rescheduling ? "APPOINTMENT_RESCHEDULED" : "APPOINTMENT_SCHEDULED",
        { status: appointment.status }, { status: "SCHEDULED", scheduledFor: scheduledFor.toISOString(), professional: professional || "" });
    notifyPatient(batch, appointment, {
        type: "APPOINTMENT_SCHEDULED",
        title: rescheduling ? "Horário alterado" : "Agendamento marcado",
        message: `${appointment.serviceName}: ${label}${professional ? ` com ${professional}` : ""}. Confirme sua presença no aplicativo.`
    });
    await batch.commit();
}

export async function cancelByClinic({ appointment, actor, reason }) {
    const batch = writeBatch(db);
    batch.update(doc(db, "appointments", appointment.id), {
        status: "CANCELLED",
        cancelReason: reason,
        cancelledBy: actor.uid,
        cancelledAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    });
    addHistory(batch, appointment, actor, "CANCELLED", reason);
    audit(batch, actor, appointment, "APPOINTMENT_CANCELLED", { status: appointment.status }, { status: "CANCELLED", reason });
    notifyPatient(batch, appointment, {
        type: "APPOINTMENT_CANCELLED",
        title: "Agendamento cancelado",
        message: `${appointment.serviceName} (protocolo ${appointment.protocol}) foi cancelado pela clínica. Motivo: ${reason}`
    });
    await batch.commit();
}

export async function markCompleted({ appointment, actor }) {
    const batch = writeBatch(db);
    const update = { status: "COMPLETED", completedAt: serverTimestamp(), updatedAt: serverTimestamp() };
    let estimate = null;
    if (appointment.kind === "EXAM") {
        estimate = new Date();
        estimate.setDate(estimate.getDate() + (Number(appointment.resultDays) || 1));
        Object.assign(update, { resultStatus: "IN_ANALYSIS", resultEstimatedAt: Timestamp.fromDate(estimate) });
    }
    batch.update(doc(db, "appointments", appointment.id), update);
    addHistory(batch, appointment, actor, "COMPLETED", appointment.kind === "EXAM" ? "Exame realizado - resultado em análise" : "Consulta realizada");
    audit(batch, actor, appointment, "APPOINTMENT_COMPLETED", { status: appointment.status }, { status: "COMPLETED", resultStatus: update.resultStatus || null });
    notifyPatient(batch, appointment, appointment.kind === "EXAM"
        ? { type: "RESULT_IN_ANALYSIS", title: "Exame realizado", message: `${appointment.serviceName}: o resultado está em análise. Previsão: ${formatDate(estimate)}. Avisaremos quando ficar pronto.` }
        : { type: "APPOINTMENT_COMPLETED", title: "Consulta realizada", message: `${appointment.serviceName} registrada como realizada. Obrigado!` });
    await batch.commit();
}

export async function markNoShow({ appointment, actor }) {
    const batch = writeBatch(db);
    batch.update(doc(db, "appointments", appointment.id), { status: "NO_SHOW", updatedAt: serverTimestamp() });
    addHistory(batch, appointment, actor, "NO_SHOW", "Paciente não compareceu");
    audit(batch, actor, appointment, "APPOINTMENT_NO_SHOW", { status: appointment.status }, { status: "NO_SHOW" });
    await batch.commit();
}

export async function updateResultStatus({ appointment, actor, resultStatus, estimatedAt = null, note = "" }) {
    if (!RESULT_STATUS[resultStatus]) throw userError("Status de resultado inválido.");
    const update = { resultStatus, resultNote: note.trim(), updatedAt: serverTimestamp() };
    if (resultStatus === "IN_ANALYSIS" && estimatedAt) update.resultEstimatedAt = Timestamp.fromDate(estimatedAt);
    if (resultStatus === "READY") update.resultReadyAt = serverTimestamp();
    if (resultStatus === "DELIVERED") update.resultDeliveredAt = serverTimestamp();

    const batch = writeBatch(db);
    batch.update(doc(db, "appointments", appointment.id), update);
    addHistory(batch, appointment, actor, appointment.status, `Resultado: ${RESULT_STATUS[resultStatus].label}${note ? ` - ${note}` : ""}`);
    audit(batch, actor, appointment, "RESULT_STATUS_UPDATED", { resultStatus: appointment.resultStatus || null }, { resultStatus, note });
    if (resultStatus === "READY") {
        notifyPatient(batch, appointment, {
            type: "RESULT_READY",
            title: "Resultado pronto",
            message: `O resultado de ${appointment.serviceName} está pronto para retirada na recepção. Leve um documento com foto.${note ? ` ${note}` : ""}`
        });
    } else if (resultStatus === "IN_ANALYSIS" && estimatedAt) {
        notifyPatient(batch, appointment, {
            type: "RESULT_IN_ANALYSIS",
            title: "Nova previsão do resultado",
            message: `${appointment.serviceName}: nova previsão para ${formatDate(estimatedAt)}.${note ? ` ${note}` : ""}`
        });
    }
    await batch.commit();
}

export async function reviewDocument({ appointment, document, actor, approved, reason = "" }) {
    const batch = writeBatch(db);
    batch.update(doc(db, "appointments", appointment.id, "documents", document.id), {
        status: approved ? "APPROVED" : "REJECTED",
        reviewedBy: actor.uid,
        reviewedByName: actor.name || "",
        reviewedAt: serverTimestamp(),
        reviewReason: approved ? null : reason
    });
    addAudit(batch, actor, {
        action: approved ? "DOCUMENT_APPROVED" : "DOCUMENT_REJECTED", entity: "DOCUMENT", entityId: document.id,
        patientId: appointment.patientId, newData: { appointmentId: appointment.id, reason }
    });
    if (!approved) {
        notifyPatient(batch, appointment, {
            type: "DOCUMENT_REJECTED",
            title: "Documento precisa ser reenviado",
            message: `${DOCUMENT_TYPES[document.type] || "Documento"} (protocolo ${appointment.protocol}): ${reason}. Abra o agendamento para enviar de novo.`
        });
    }
    await batch.commit();
}
