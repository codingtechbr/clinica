// Agenda do dia: atendimentos marcados, confirmações, realizados e faltas.
import { initAdminPage } from "./shell.js";
import { actionButtonsHtml, runAction } from "./appointment-actions.js";
import { listClinicAppointments } from "../services/appointments-service.js";
import { icon, statusBadge, renderError, emptyState, loadingState, toast } from "../ui.js";
import {
    escapeHtml, pageUrl, SERVICE_KINDS, PAYMENT_TYPES, formatTime, isSameDay, toDate, toDateInputValue, friendlyError, formatPhone
} from "../utils.js";

const { profile, actor, content, can } = await initAdminPage("agenda", "Agenda");

let appointments = [];

content.innerHTML = `
    <section class="panel no-print">
        <div class="filters">
            <div class="field"><label for="f-date">Dia</label><input id="f-date" type="date" class="input" value="${toDateInputValue()}"></div>
            <div class="field"><label for="f-kind">Tipo</label><select id="f-kind" class="input"><option value="">Todos</option>
                ${Object.entries(SERVICE_KINDS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join("")}</select></div>
            <div class="field"><label for="f-professional">Profissional</label><input id="f-professional" class="input" placeholder="Todos"></div>
            <div class="field field--action"><button type="button" class="btn btn-secondary" id="print">${icon("printer", 18)} Imprimir agenda</button></div>
        </div>
    </section>
    <section class="panel"><h2 class="panel__title" id="day-title"></h2><div id="results">${loadingState()}</div></section>`;

const $ = (id) => document.getElementById(id);
const results = $("results");

function render() {
    const day = new Date(`${$("f-date").value}T12:00:00`);
    const kind = $("f-kind").value;
    const professional = $("f-professional").value.trim().toLowerCase();
    const list = appointments
        .filter((a) => a.scheduledFor && isSameDay(a.scheduledFor, day))
        .filter((a) => (!kind || a.kind === kind) && (!professional || (a.professional || "").toLowerCase().includes(professional)))
        .sort((a, b) => toDate(a.scheduledFor) - toDate(b.scheduledFor));
    $("day-title").textContent = `${day.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })} · ${list.length} atendimento(s)`;
    if (!list.length) {
        results.innerHTML = emptyState({ title: "Nenhum atendimento neste dia.", iconName: "calendar" });
        return;
    }
    results.innerHTML = `<div class="table-wrap"><table class="table">
        <thead><tr><th>Horário</th><th>Paciente</th><th>Atendimento</th><th>Profissional</th><th>Pagamento</th><th>Situação</th><th class="no-print">Ações</th></tr></thead>
        <tbody>${list.map((a) => `<tr>
            <td><strong>${formatTime(a.scheduledFor)}</strong></td>
            <td><a href="${pageUrl("admin/agendamento.html", { id: a.id })}">${escapeHtml(a.patientName)}</a><br><small class="text-secondary">${escapeHtml(formatPhone(a.patientPhone))}</small></td>
            <td>${escapeHtml(a.serviceName)}</td>
            <td>${escapeHtml(a.professional || "—")}</td>
            <td>${a.payment?.type === "INSURANCE" ? escapeHtml(a.payment.insuranceName) : PAYMENT_TYPES.PRIVATE}</td>
            <td>${statusBadge(a.status, "admin")}</td>
            <td class="table-actions no-print">${actionButtonsHtml(a, can, { small: true })}</td>
        </tr>`).join("")}</tbody></table></div>`;
}

["f-date", "f-kind"].forEach((id) => $(id).addEventListener("change", render));
$("f-professional").addEventListener("input", render);
$("print").addEventListener("click", () => window.print());

results.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const appointment = appointments.find((a) => a.id === button.dataset.id);
    try {
        if (await runAction(button.dataset.action, appointment, actor)) await load();
    } catch (error) {
        console.error(error);
        toast(friendlyError(error), "error", 7000);
    }
});

async function load() {
    results.innerHTML = loadingState();
    try {
        const lists = await Promise.all(["SCHEDULED", "CONFIRMED", "COMPLETED", "NO_SHOW"]
            .map((status) => listClinicAppointments(profile.clinicId, { status })));
        appointments = lists.flat();
        render();
    } catch (error) {
        console.error(error);
        renderError(results, load);
    }
}

load();
