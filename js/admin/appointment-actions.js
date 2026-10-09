// Ações da equipe sobre um agendamento (abrem modal quando precisam de dados).
// Retorna true quando algo foi alterado (para a tela recarregar).
import { openScheduleModal } from "./schedule-modal.js";
import {
    cancelByClinic, markCompleted, markNoShow, updateResultStatus
} from "../services/appointments-service.js";
import { openModal, confirmDialog, toast } from "../ui.js";
import { escapeHtml, toDateInputValue, toDate, userError, ROLE_GROUPS } from "../utils.js";

// Ações disponíveis para um agendamento conforme status e perfil.
export function actionsFor(a, can) {
    const list = [];
    const scheduling = can(ROLE_GROUPS.SCHEDULING);
    if (scheduling && a.status === "REQUESTED") list.push({ id: "schedule", label: "Marcar horário", primary: true });
    if (scheduling && ["SCHEDULED", "CONFIRMED"].includes(a.status)) {
        list.push({ id: "complete", label: a.kind === "EXAM" ? "Exame realizado" : "Consulta realizada", primary: true });
        list.push({ id: "no-show", label: "Faltou" });
        list.push({ id: "schedule", label: "Remarcar" });
    }
    if (can(ROLE_GROUPS.RESULTS) && a.kind === "EXAM" && a.status === "COMPLETED") {
        if (a.resultStatus === "IN_ANALYSIS") {
            list.push({ id: "result-ready", label: "Resultado pronto", primary: true });
            list.push({ id: "result-estimate", label: "Alterar previsão" });
        }
        if (a.resultStatus === "READY") list.push({ id: "result-delivered", label: "Entregue ao paciente", primary: true });
    }
    if (scheduling && ["REQUESTED", "SCHEDULED", "CONFIRMED"].includes(a.status)) list.push({ id: "cancel", label: "Cancelar", danger: true });
    return list;
}

export function actionButtonsHtml(a, can, { small = false } = {}) {
    return actionsFor(a, can).map((x) => `<button type="button" class="btn ${small ? "btn-sm" : ""} ${x.primary ? "btn-primary" : x.danger ? "btn-danger-outline" : "btn-secondary"}"
        data-action="${x.id}" data-id="${escapeHtml(a.id)}">${escapeHtml(x.label)}</button>`).join("");
}

function noteField(label = "Observação ao paciente (opcional)") {
    return `<div class="field"><label for="note">${label}</label><textarea id="note" name="note" class="input" rows="2"></textarea></div>`;
}

export async function runAction(actionId, appointment, actor) {
    const name = `${escapeHtml(appointment.patientName)} · ${escapeHtml(appointment.serviceName)}`;
    switch (actionId) {
        case "schedule": {
            const ok = await openScheduleModal({ appointment, actor });
            if (ok) toast("Horário marcado. O paciente foi avisado.", "success");
            return Boolean(ok);
        }
        case "complete": {
            const exam = appointment.kind === "EXAM";
            if (!await confirmDialog({
                title: exam ? "Exame realizado" : "Consulta realizada",
                message: `${appointment.patientName} - ${appointment.serviceName}.${exam ? " O resultado ficará em análise e o paciente verá a previsão." : ""}`,
                confirmLabel: "Confirmar"
            })) return false;
            await markCompleted({ appointment, actor });
            toast("Atendimento registrado.", "success");
            return true;
        }
        case "no-show": {
            if (!await confirmDialog({ title: "Registrar falta", message: `${appointment.patientName} não compareceu?`, confirmLabel: "Registrar falta", danger: true })) return false;
            await markNoShow({ appointment, actor });
            toast("Falta registrada.", "success");
            return true;
        }
        case "cancel": {
            const result = await openModal({
                title: "Cancelar agendamento",
                confirmLabel: "Cancelar e avisar paciente",
                cancelLabel: "Voltar",
                danger: true,
                body: `<p class="hint">${name}</p>
                    <div class="field"><label for="reason">Motivo (o paciente verá)</label>
                    <textarea id="reason" name="reason" class="input" rows="3" required></textarea></div>`,
                onConfirm: async (form) => {
                    const reason = form.elements.namedItem("reason").value.trim();
                    if (!reason) throw userError("Informe o motivo.");
                    await cancelByClinic({ appointment, actor, reason });
                }
            });
            if (result) toast("Agendamento cancelado.", "success");
            return Boolean(result);
        }
        case "result-ready": {
            const result = await openModal({
                title: "Resultado pronto para retirada",
                confirmLabel: "Avisar paciente",
                body: `<p class="hint">${name}</p>${noteField()}`,
                onConfirm: async (form) => {
                    await updateResultStatus({ appointment, actor, resultStatus: "READY", note: form.elements.namedItem("note").value });
                }
            });
            if (result) toast("Paciente avisado: resultado pronto.", "success");
            return Boolean(result);
        }
        case "result-estimate": {
            const current = toDate(appointment.resultEstimatedAt);
            const result = await openModal({
                title: "Alterar previsão do resultado",
                confirmLabel: "Salvar e avisar paciente",
                body: `<p class="hint">${name}</p>
                    <div class="field"><label for="estimate">Nova previsão</label>
                    <input id="estimate" name="estimate" type="date" class="input" min="${toDateInputValue()}" value="${current ? toDateInputValue(current) : ""}" required></div>
                    ${noteField("Motivo (opcional)")}`,
                onConfirm: async (form) => {
                    const value = form.elements.namedItem("estimate").value;
                    if (!value) throw userError("Informe a nova data.");
                    await updateResultStatus({ appointment, actor, resultStatus: "IN_ANALYSIS", estimatedAt: new Date(`${value}T12:00:00`), note: form.elements.namedItem("note").value });
                }
            });
            if (result) toast("Previsão atualizada.", "success");
            return Boolean(result);
        }
        case "result-delivered": {
            if (!await confirmDialog({ title: "Resultado entregue", message: `Confirmar a entrega do resultado para ${appointment.patientName}?`, confirmLabel: "Confirmar entrega" })) return false;
            await updateResultStatus({ appointment, actor, resultStatus: "DELIVERED" });
            toast("Entrega registrada.", "success");
            return true;
        }
        default:
            return false;
    }
}
