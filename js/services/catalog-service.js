// Catálogo da clínica: exames/consultas (services) e convênios (insurances).
import { db } from "../firebase-config.js";
import { doc, collection, getDocs, query, where, writeBatch, serverTimestamp } from "../lib/firestore.js";
import { addAudit } from "./audit-service.js";

/* ---------- Exames e consultas ---------- */

export const DEFAULT_SERVICES = [
    { name: "Consulta Clínica Geral", kind: "CONSULTATION", specialty: "Clínica Geral", price: 150, durationMinutes: 30 },
    { name: "Consulta Cardiologia", kind: "CONSULTATION", specialty: "Cardiologia", price: 250, durationMinutes: 30 },
    { name: "Consulta Ginecologia", kind: "CONSULTATION", specialty: "Ginecologia", price: 220, durationMinutes: 30 },
    { name: "Consulta Pediatria", kind: "CONSULTATION", specialty: "Pediatria", price: 200, durationMinutes: 30 },
    { name: "Consulta Ortopedia", kind: "CONSULTATION", specialty: "Ortopedia", price: 230, durationMinutes: 30 },
    { name: "Hemograma completo", kind: "EXAM", specialty: "Laboratório", price: 35, resultDays: 1, requiresMedicalRequest: true,
        preparation: "Não é necessário jejum. Informe se usa medicamentos." },
    { name: "Glicemia em jejum", kind: "EXAM", specialty: "Laboratório", price: 20, resultDays: 1, requiresMedicalRequest: true,
        preparation: "Jejum de 8 horas. Pode beber água." },
    { name: "Colesterol total e frações", kind: "EXAM", specialty: "Laboratório", price: 45, resultDays: 2, requiresMedicalRequest: true,
        preparation: "Jejum de 12 horas. Evite bebida alcoólica nas 72 horas anteriores." },
    { name: "Urina tipo 1 (EAS)", kind: "EXAM", specialty: "Laboratório", price: 25, resultDays: 1, requiresMedicalRequest: true,
        preparation: "Colete a primeira urina da manhã em frasco próprio, entregue na recepção." },
    { name: "Eletrocardiograma", kind: "EXAM", specialty: "Cardiologia", price: 80, resultDays: 1, requiresMedicalRequest: true,
        preparation: "Evite cremes ou óleos no peito no dia do exame." },
    { name: "Ultrassonografia abdominal total", kind: "EXAM", specialty: "Imagem", price: 180, resultDays: 2, requiresMedicalRequest: true,
        preparation: "Jejum de 8 horas e bexiga cheia: beba 4 copos de água 1 hora antes e não urine." },
    { name: "Raio-X de tórax", kind: "EXAM", specialty: "Imagem", price: 90, resultDays: 2, requiresMedicalRequest: true,
        preparation: "Não precisa de preparo. Retire objetos de metal." },
    { name: "Mamografia", kind: "EXAM", specialty: "Imagem", price: 160, resultDays: 3, requiresMedicalRequest: true,
        preparation: "Não use desodorante, talco ou creme nas axilas e mamas no dia do exame." }
];

export async function listServices(clinicId, { activeOnly = false } = {}) {
    const snapshot = await getDocs(query(collection(db, "services"), where("clinicId", "==", clinicId)));
    return snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((s) => !activeOnly || s.active !== false)
        .sort((a, b) => (a.name || "").localeCompare(b.name || "", "pt-BR"));
}

function servicePayload(clinicId, data) {
    return {
        clinicId,
        name: data.name.trim(),
        kind: data.kind,
        specialty: (data.specialty || "").trim(),
        price: Number(data.price) || 0,
        durationMinutes: Number(data.durationMinutes) || 30,
        resultDays: data.kind === "EXAM" ? Number(data.resultDays) || 0 : 0,
        preparation: (data.preparation || "").trim(),
        requiresMedicalRequest: data.kind === "EXAM" && Boolean(data.requiresMedicalRequest),
        active: data.active !== false,
        updatedAt: serverTimestamp()
    };
}

export async function saveService(actor, data, id = null) {
    const ref = id ? doc(db, "services", id) : doc(collection(db, "services"));
    const payload = servicePayload(actor.clinicId, data);
    if (!id) payload.createdAt = serverTimestamp();
    const batch = writeBatch(db);
    batch.set(ref, payload, { merge: true });
    addAudit(batch, actor, { action: id ? "SERVICE_UPDATED" : "SERVICE_CREATED", entity: "SERVICE", entityId: ref.id, newData: { name: payload.name, price: payload.price, active: payload.active } });
    await batch.commit();
}

export async function seedDefaultServices(actor) {
    const existing = await listServices(actor.clinicId);
    const names = new Set(existing.map((s) => s.name.toLowerCase()));
    const missing = DEFAULT_SERVICES.filter((s) => !names.has(s.name.toLowerCase()));
    if (!missing.length) return 0;
    const batch = writeBatch(db);
    missing.forEach((s) => batch.set(doc(collection(db, "services")), { ...servicePayload(actor.clinicId, s), createdAt: serverTimestamp() }));
    addAudit(batch, actor, { action: "SERVICES_SEEDED", entity: "SERVICE", entityId: "seed", newData: { count: missing.length } });
    await batch.commit();
    return missing.length;
}

/* ---------- Convênios ---------- */

export const DEFAULT_INSURANCES = ["Unimed", "Bradesco Saúde", "SulAmérica", "Hapvida", "Planserv", "Cassi"];

export async function listInsurances(clinicId, { activeOnly = false } = {}) {
    const snapshot = await getDocs(query(collection(db, "insurances"), where("clinicId", "==", clinicId)));
    return snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((i) => !activeOnly || i.active !== false)
        .sort((a, b) => (a.name || "").localeCompare(b.name || "", "pt-BR"));
}

export async function saveInsurance(actor, data, id = null) {
    const ref = id ? doc(db, "insurances", id) : doc(collection(db, "insurances"));
    const payload = {
        clinicId: actor.clinicId,
        name: data.name.trim(),
        notes: (data.notes || "").trim(),
        active: data.active !== false,
        updatedAt: serverTimestamp()
    };
    if (!id) payload.createdAt = serverTimestamp();
    const batch = writeBatch(db);
    batch.set(ref, payload, { merge: true });
    addAudit(batch, actor, { action: id ? "INSURANCE_UPDATED" : "INSURANCE_CREATED", entity: "INSURANCE", entityId: ref.id, newData: { name: payload.name, active: payload.active } });
    await batch.commit();
}

export async function seedDefaultInsurances(actor) {
    const existing = await listInsurances(actor.clinicId);
    const names = new Set(existing.map((i) => i.name.toLowerCase()));
    const missing = DEFAULT_INSURANCES.filter((n) => !names.has(n.toLowerCase()));
    if (!missing.length) return 0;
    const batch = writeBatch(db);
    missing.forEach((name) => batch.set(doc(collection(db, "insurances")), {
        clinicId: actor.clinicId, name, notes: "", active: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    }));
    addAudit(batch, actor, { action: "INSURANCES_SEEDED", entity: "INSURANCE", entityId: "seed", newData: { count: missing.length } });
    await batch.commit();
    return missing.length;
}
