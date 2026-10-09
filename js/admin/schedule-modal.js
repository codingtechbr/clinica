// Modal para marcar/remarcar o horário de um pedido.
import { scheduleAppointment } from "../services/appointments-service.js";
import { getClinic } from "../services/settings-service.js";
import { openModal } from "../ui.js";
import {
    escapeHtml, toDateInputValue, toDate, PERIODS, PAYMENT_TYPES, formatBirthDate, formatMoney, userError
} from "../utils.js";

export async function openScheduleModal({ appointment, actor }) {
    const clinic = await getClinic(actor.clinicId).catch(() => null);
    const current = toDate(appointment.scheduledFor);
    const pad = (n) => String(n).padStart(2, "0");
    const defaultDate = current ? toDateInputValue(current) : (appointment.preferredDate || "");
    const defaultTime = current ? `${pad(current.getHours())}:${pad(current.getMinutes())}` : (appointment.preferredPeriod === "AFTERNOON" ? "14:00" : "08:00");
    const instructions = appointment.instructions
        || [appointment.preparation, "Chegue 15 minutos antes. Traga documento com foto" + (appointment.payment?.type === "INSURANCE" ? " e a carteirinha do convênio." : ".")].filter(Boolean).join(" ");
    const pay = appointment.payment?.type === "INSURANCE"
        ? `${escapeHtml(appointment.payment.insuranceName)} · carteirinha ${escapeHtml(appointment.payment.cardNumber || "")}`
        : `${PAYMENT_TYPES.PRIVATE}${formatMoney(appointment.price) ? ` · ${formatMoney(appointment.price)}` : ""}`;

    return openModal({
        title: `${current ? "Remarcar" : "Marcar horário"} · ${appointment.serviceName}`,
        confirmLabel: current ? "Remarcar e avisar paciente" : "Marcar e avisar paciente",
        body: `
            <p class="hint">Paciente: <strong>${escapeHtml(appointment.patientName)}</strong> · ${pay}</p>
            <p class="hint">Preferência: ${appointment.preferredDate ? formatBirthDate(appointment.preferredDate) : "primeira data disponível"} · ${escapeHtml(PERIODS[appointment.preferredPeriod] || "")}</p>
            <div class="field-row">
                <div class="field"><label for="s-date">Data</label><input id="s-date" name="date" type="date" class="input" min="${toDateInputValue()}" value="${escapeHtml(defaultDate)}" required></div>
                <div class="field"><label for="s-time">Horário</label><input id="s-time" name="time" type="time" class="input" value="${escapeHtml(defaultTime)}" required></div>
            </div>
            <div class="field"><label for="s-professional">Profissional (opcional)</label><input id="s-professional" name="professional" class="input" value="${escapeHtml(appointment.professional || "")}" placeholder="Ex.: Dra. Ana Souza"></div>
            <div class="field"><label for="s-location">Local / sala (opcional)</label><input id="s-location" name="location" class="input" value="${escapeHtml(appointment.location || clinic?.address || "")}"></div>
            <div class="field"><label for="s-instructions">Orientações ao paciente</label><textarea id="s-instructions" name="instructions" class="input" rows="3">${escapeHtml(instructions)}</textarea></div>`,
        onConfirm: async (form) => {
            const data = Object.fromEntries(new FormData(form));
            if (!data.date || !data.time) throw userError("Informe data e horário.");
            await scheduleAppointment({
                appointment,
                actor,
                scheduledFor: new Date(`${data.date}T${data.time}:00`),
                professional: data.professional,
                location: data.location,
                instructions: data.instructions
            });
        }
    });
}
