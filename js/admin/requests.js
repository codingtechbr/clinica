// Pedidos de agendamento aguardando horário (fila da recepção).
import { initAdminPage } from "./shell.js";
import { actionButtonsHtml, runAction } from "./appointment-actions.js";
import { listClinicAppointments } from "../services/appointments-service.js";
import { renderError, emptyState, loadingState, toast } from "../ui.js";
import {
    escapeHtml, pageUrl, SERVICE_KINDS, PERIODS, ROLE_GROUPS, formatDateTime, formatBirthDate, formatCPF, formatPhone,
    normalizeText, onlyDigits, debounce, daysSince, friendlyError, sortByDate
} from "../utils.js";

const { profile, actor, content, can } = await initAdminPage("requests", "Pedidos de agendamento", ROLE_GROUPS.SCHEDULING);

let requests = [];

content.innerHTML = `
    <section class="panel">
        <div class="filters">
            <div class="field"><label for="f-text">Paciente, CPF ou protocolo</label><input id="f-text" class="input" type="search" autocomplete="off"></div>
            <div class="field"><label for="f-kind">Tipo</label><select id="f-kind" class="input"><option value="">Todos</option>
                ${Object.entries(SERVICE_KINDS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join("")}</select></div>
            <div class="field"><label for="f-payment">Pagamento</label><select id="f-payment" class="input"><option value="">Todos</option>
                <option value="PRIVATE">Particular</option><option value="INSURANCE">Convênio</option></select></div>
        </div>
        <p class="hint" id="count" aria-live="polite"></p>
        <div id="results">${loadingState()}</div>
    </section>`;

const $ = (id) => document.getElementById(id);
const results = $("results");

function render() {
    const text = normalizeText($("f-text").value);
    const digits = onlyDigits($("f-text").value);
    const list = requests.filter((a) => {
        if ($("f-kind").value && a.kind !== $("f-kind").value) return false;
        if ($("f-payment").value && a.payment?.type !== $("f-payment").value) return false;
        if (text && !normalizeText(`${a.patientName} ${a.protocol} ${a.serviceName}`).includes(text) && !(digits.length >= 3 && (a.patientCpf || "").includes(digits))) return false;
        return true;
    });
    $("count").textContent = `${list.length} pedido(s) aguardando horário · mais antigos primeiro`;
    if (!list.length) {
        results.innerHTML = emptyState({ title: "Nenhum pedido aguardando.", text: "Novos pedidos dos pacientes aparecem aqui.", iconName: "check" });
        return;
    }
    results.innerHTML = `<div class="table-wrap"><table class="table">
        <thead><tr><th>Pedido</th><th>Paciente</th><th>Atendimento</th><th>Pagamento</th><th>Preferência</th><th>Ações</th></tr></thead>
        <tbody>${list.map((a) => `<tr>
            <td><a href="${pageUrl("admin/agendamento.html", { id: a.id })}"><strong>${escapeHtml(a.protocol)}</strong></a><br>
                <small class="text-secondary">${formatDateTime(a.requestedAt || a.createdAt)} · há ${daysSince(a.requestedAt || a.createdAt) ?? 0} dia(s)</small></td>
            <td>${escapeHtml(a.patientName)}<br><small class="text-secondary">${escapeHtml(formatCPF(a.patientCpf))} · ${escapeHtml(formatPhone(a.patientPhone))}</small></td>
            <td>${escapeHtml(a.serviceName)}<br><small class="text-secondary">${escapeHtml(SERVICE_KINDS[a.kind]?.label || "")}</small></td>
            <td>${a.payment?.type === "INSURANCE" ? `${escapeHtml(a.payment.insuranceName)}<br><small class="text-secondary">${escapeHtml(a.payment.cardNumber || "")}</small>` : "Particular"}</td>
            <td>${a.preferredDate ? formatBirthDate(a.preferredDate) : "Primeira disponível"}<br><small class="text-secondary">${escapeHtml(PERIODS[a.preferredPeriod] || "")}</small></td>
            <td class="table-actions">${actionButtonsHtml(a, can, { small: true })}</td>
        </tr>`).join("")}</tbody></table></div>`;
}

$("f-text").addEventListener("input", debounce(render, 200));
$("f-kind").addEventListener("change", render);
$("f-payment").addEventListener("change", render);

results.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const appointment = requests.find((a) => a.id === button.dataset.id);
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
        requests = sortByDate(await listClinicAppointments(profile.clinicId, { status: "REQUESTED" }), "createdAt", "asc");
        render();
    } catch (error) {
        console.error(error);
        renderError(results, load);
    }
}

load();
