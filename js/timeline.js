// Linha do tempo do agendamento (app do paciente e painel).
import { STATUS, formatDate, formatDateTime, escapeHtml, sortByDate } from "./utils.js";
import { icon } from "./ui.js";

const STAGE = { REQUESTED: 1, SCHEDULED: 2, CONFIRMED: 3, COMPLETED: 4 };
// Índice (base 0) do passo atual em cada situação do resultado.
const RESULT_STAGE = { IN_ANALYSIS: 4, READY: 6, DELIVERED: 7 };

export function buildTimeline(appointment, history = []) {
    const entries = sortByDate(history, "createdAt", "asc");
    const firstDate = (status) => entries.find((h) => h.newStatus === status)?.createdAt || null;
    const isExam = appointment.kind === "EXAM";

    const steps = [
        { label: "Pedido enviado", date: appointment.requestedAt || appointment.createdAt },
        { label: "Aguardando a recepção marcar o horário", doneLabel: "Horário marcado", date: firstDate("SCHEDULED"), detail: appointment.scheduledFor ? `Para ${formatDateTime(appointment.scheduledFor)}` : "" },
        { label: "Confirmar presença", doneLabel: "Presença confirmada", date: firstDate("CONFIRMED") },
        { label: isExam ? "Realização do exame" : "Consulta", doneLabel: isExam ? "Exame realizado" : "Consulta realizada", date: appointment.completedAt }
    ];
    if (isExam) {
        steps.push(
            { label: "Resultado em análise", doneLabel: "Resultado analisado", date: appointment.resultReadyAt,
                detail: appointment.resultEstimatedAt ? `Previsão: ${formatDate(appointment.resultEstimatedAt)}` : "" },
            { label: "Pronto para retirada", date: appointment.resultReadyAt },
            { label: "Resultado entregue", currentLabel: "Aguardando retirada na recepção", date: appointment.resultDeliveredAt }
        );
    }

    if (appointment.status === "CANCELLED" || appointment.status === "NO_SHOW") {
        const finalEntry = [...entries].reverse().find((h) => h.newStatus === appointment.status);
        const base = STAGE[finalEntry?.previousStatus] ?? 1;
        const done = steps.slice(0, base).map((s) => ({ ...s, state: "done", label: s.doneLabel || s.label }));
        done.push({ label: STATUS[appointment.status].citizen, date: finalEntry?.createdAt || appointment.updatedAt, note: appointment.cancelReason || finalEntry?.reason || "", state: "cancelled" });
        return done;
    }

    let current = STAGE[appointment.status] ?? 1;
    if (appointment.status === "COMPLETED") current = isExam ? (RESULT_STAGE[appointment.resultStatus] ?? 4) : steps.length;

    return steps.map((step, index) => {
        if (index < current) return { ...step, state: "done", label: step.doneLabel || step.label };
        if (index === current) return { ...step, state: "current", label: step.currentLabel || step.label, date: null };
        return { ...step, state: "todo", date: null, detail: index === 1 ? "" : step.detail };
    });
}

const STATE_TEXT = { done: "concluído", current: "etapa atual", alert: "precisa de atenção", cancelled: "encerrado", todo: "pendente" };

export function renderTimeline(steps) {
    return `<ol class="timeline">
        ${steps.map((step) => {
            const marker = step.state === "done" ? icon("check", 16)
                : step.state === "cancelled" ? icon("x", 16)
                    : step.state === "current" ? '<span class="timeline__dot"></span>' : "";
            return `<li class="timeline__item timeline__item--${step.state}">
                <span class="timeline__marker" aria-hidden="true">${marker}</span>
                <div class="timeline__content">
                    <p class="timeline__title">${escapeHtml(step.label)} <span class="sr-only">(${STATE_TEXT[step.state]})</span></p>
                    ${step.date && step.state !== "current" ? `<p class="timeline__date">${formatDate(step.date)}</p>` : ""}
                    ${step.detail ? `<p class="timeline__date">${escapeHtml(step.detail)}</p>` : ""}
                    ${step.note ? `<p class="timeline__note">${escapeHtml(step.note)}</p>` : ""}
                </div>
            </li>`;
        }).join("")}
    </ol>`;
}
