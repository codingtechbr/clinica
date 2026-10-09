// Componentes das telas do paciente.
import { icon, statusBadge, resultBadge, toast, setButtonLoading, openModal } from "../ui.js";
import { confirmPresence, cancelByPatient } from "../services/appointments-service.js";
import {
    escapeHtml, pageUrl, SERVICE_KINDS, PERIODS, PAYMENT_TYPES, formatLongDate, formatTime, formatWeekday,
    formatBirthDate, formatDate, friendlyError, userError, ACTIVE_STATUSES
} from "../utils.js";

function whenHtml(a) {
    if (a.scheduledFor) {
        return `<div class="appointment-card__when">
            <div>${icon("calendar", 20)}<span><strong>${formatLongDate(a.scheduledFor)}</strong><small>${escapeHtml(formatWeekday(a.scheduledFor))}</small></span></div>
            <div>${icon("clock", 20)}<strong>${formatTime(a.scheduledFor)}</strong></div>
        </div>`;
    }
    const pref = a.preferredDate ? `Preferência: ${formatBirthDate(a.preferredDate)}, ${PERIODS[a.preferredPeriod] || ""}` : `Preferência: ${PERIODS[a.preferredPeriod] || "qualquer horário"}`;
    return `<p class="appointment-card__waiting">${icon("clock", 18)} <span>Aguardando a recepção marcar o horário<br><small>${escapeHtml(pref)}</small></span></p>`;
}

export function appointmentCard(a, { actions = true, link = true } = {}) {
    const kind = SERVICE_KINDS[a.kind] || { label: "Atendimento", icon: "calendar" };
    const active = ACTIVE_STATUSES.includes(a.status);
    return `<article class="card appointment-card ${a.status === "SCHEDULED" ? "appointment-card--active" : ""}">
        <div class="appointment-card__head">
            <span class="request-card__icon">${icon(kind.icon, 20)}</span>
            <div>
                <p class="appointment-card__eyebrow">${escapeHtml(kind.label)} · Protocolo ${escapeHtml(a.protocol)}</p>
                <h3 class="appointment-card__title">${escapeHtml(a.serviceName)}</h3>
            </div>
        </div>
        ${active || a.scheduledFor ? whenHtml(a) : ""}
        ${a.professional ? `<p class="appointment-card__place">${icon("user", 18)}<span>${escapeHtml(a.professional)}</span></p>` : ""}
        ${a.location ? `<p class="appointment-card__place">${icon("mapPin", 18)}<span>${escapeHtml(a.location)}</span></p>` : ""}
        <p class="badge-line">${statusBadge(a.status)} ${a.kind === "EXAM" ? resultBadge(a.resultStatus) : ""}
            <span class="badge badge--neutral badge--plain">${escapeHtml(a.payment?.type === "INSURANCE" ? a.payment.insuranceName || "Convênio" : PAYMENT_TYPES.PRIVATE)}</span></p>
        ${actions && a.status === "SCHEDULED" ? `<div class="appointment-card__actions">
            <button type="button" class="btn btn-primary" data-confirm="${escapeHtml(a.id)}">${icon("check", 20)} Confirmar presença</button>
        </div>` : ""}
        ${link ? `<a class="request-card__link" href="${pageUrl("app/agendamento.html", { id: a.id })}">Ver detalhes ${icon("chevronRight", 16)}</a>` : ""}
    </article>`;
}

export function resultCard(a) {
    const estimate = a.resultEstimatedAt && a.resultStatus === "IN_ANALYSIS" ? `<p class="hint">Previsão: <strong>${formatDate(a.resultEstimatedAt)}</strong></p>` : "";
    return `<a class="card card--interactive result-card result-card--${(a.resultStatus || "").toLowerCase()}" href="${pageUrl("app/agendamento.html", { id: a.id })}">
        <div class="request-card__top">
            <span class="request-card__icon">${icon(a.resultStatus === "READY" ? "check" : "flask", 20)}</span>
            <div class="request-card__body">
                <p class="request-card__title">${escapeHtml(a.serviceName)}</p>
                <p class="request-card__meta">Realizado em ${formatDate(a.completedAt)} · Protocolo ${escapeHtml(a.protocol)}</p>
            </div>
        </div>
        <div class="request-card__bottom">${resultBadge(a.resultStatus)}</div>
        ${estimate}
        ${a.resultStatus === "READY" ? '<p class="hint">Retire na recepção com documento com foto.</p>' : ""}
    </a>`;
}

// Liga "Confirmar presença" e "Cancelar" (delegação de eventos no container).
export function bindAppointmentActions(container, { user, findAppointment, onChange }) {
    container.addEventListener("click", async (event) => {
        const confirmButton = event.target.closest("[data-confirm]");
        const cancelButton = event.target.closest("[data-cancel]");
        if (!confirmButton && !cancelButton) return;
        const appointment = findAppointment(confirmButton?.dataset.confirm || cancelButton?.dataset.cancel);
        if (!appointment) return;

        if (cancelButton) {
            const result = await openModal({
                title: "Cancelar agendamento",
                confirmLabel: "Cancelar agendamento",
                cancelLabel: "Voltar",
                danger: true,
                body: `<p>${escapeHtml(appointment.serviceName)}</p>
                    <div class="field"><label for="cancel-reason">Motivo</label>
                    <select id="cancel-reason" name="reason" class="input">
                        <option>Não poderei comparecer</option>
                        <option>Já fui atendido em outro lugar</option>
                        <option>Quero remarcar para outra data</option>
                        <option>Outro motivo</option>
                    </select></div>`,
                onConfirm: async (form) => {
                    const reason = form.elements.namedItem("reason").value;
                    if (!reason) throw userError("Escolha o motivo.");
                    await cancelByPatient({ user, appointment, reason });
                }
            });
            if (result) {
                toast("Agendamento cancelado.", "success");
                await onChange();
            }
            return;
        }

        try {
            setButtonLoading(confirmButton, true, "Confirmando...");
            await confirmPresence({ user, appointment });
            toast("Presença confirmada. Obrigado!", "success");
            await onChange();
        } catch (error) {
            console.error(error);
            setButtonLoading(confirmButton, false);
            toast(friendlyError(error), "error");
        }
    });
}
