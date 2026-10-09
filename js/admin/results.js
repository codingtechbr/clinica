// Resultados de exames: em análise -> pronto para retirada -> entregue.
import { initAdminPage } from "./shell.js";
import { actionButtonsHtml, runAction } from "./appointment-actions.js";
import { listByResultStatus } from "../services/appointments-service.js";
import { resultBadge, renderError, emptyState, loadingState, toast } from "../ui.js";
import {
    escapeHtml, pageUrl, RESULT_STATUS, formatDate, formatCPF, normalizeText, onlyDigits, debounce, toDate, friendlyError, ROLE_GROUPS
} from "../utils.js";

const { profile, actor, content, can } = await initAdminPage("results", "Resultados de exames", ROLE_GROUPS.RESULTS);

let tab = "IN_ANALYSIS";
let list = [];

content.innerHTML = `
    <div class="tabs tabs--inline mb-16" role="tablist">
        ${Object.entries(RESULT_STATUS).map(([k, v]) => `<button type="button" class="tab" role="tab" data-tab="${k}" aria-selected="${k === tab}">${v.label}</button>`).join("")}
    </div>
    <section class="panel">
        <div class="filters"><div class="field field--wide"><label for="f-text">Paciente, CPF, protocolo ou exame</label><input id="f-text" class="input" type="search" autocomplete="off"></div></div>
        <div id="results">${loadingState()}</div>
    </section>`;

const results = document.getElementById("results");
const textInput = document.getElementById("f-text");

function render() {
    const text = normalizeText(textInput.value);
    const digits = onlyDigits(textInput.value);
    const filtered = list.filter((a) => !text || normalizeText(`${a.patientName} ${a.protocol} ${a.serviceName}`).includes(text) || (digits.length >= 3 && (a.patientCpf || "").includes(digits)));
    if (!filtered.length) {
        results.innerHTML = emptyState({ title: "Nenhum exame nesta situação.", iconName: "flask" });
        return;
    }
    const now = Date.now();
    results.innerHTML = `<div class="table-wrap"><table class="table">
        <thead><tr><th>Paciente</th><th>Exame</th><th>Realizado</th><th>${tab === "IN_ANALYSIS" ? "Previsão" : tab === "READY" ? "Pronto desde" : "Entregue em"}</th><th>Situação</th><th>Ações</th></tr></thead>
        <tbody>${filtered.map((a) => {
            const late = tab === "IN_ANALYSIS" && toDate(a.resultEstimatedAt) && toDate(a.resultEstimatedAt).getTime() < now - 86400000;
            const when = tab === "IN_ANALYSIS" ? a.resultEstimatedAt : tab === "READY" ? a.resultReadyAt : a.resultDeliveredAt;
            return `<tr>
                <td><a href="${pageUrl("admin/agendamento.html", { id: a.id })}">${escapeHtml(a.patientName)}</a><br><small class="text-secondary">${escapeHtml(formatCPF(a.patientCpf))}</small></td>
                <td>${escapeHtml(a.serviceName)}<br><small class="text-secondary">${escapeHtml(a.protocol)}</small></td>
                <td>${formatDate(a.completedAt)}</td>
                <td>${formatDate(when)}${late ? ' <span class="badge badge--danger">Atrasado</span>' : ""}</td>
                <td>${resultBadge(a.resultStatus)}</td>
                <td class="table-actions">${actionButtonsHtml(a, can, { small: true })}</td>
            </tr>`;
        }).join("")}</tbody></table></div>`;
}

content.addEventListener("click", async (event) => {
    const tabButton = event.target.closest("[data-tab]");
    if (tabButton) {
        tab = tabButton.dataset.tab;
        content.querySelectorAll("[data-tab]").forEach((t) => t.setAttribute("aria-selected", String(t === tabButton)));
        load();
        return;
    }
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const appointment = list.find((a) => a.id === button.dataset.id);
    try {
        if (await runAction(button.dataset.action, appointment, actor)) await load();
    } catch (error) {
        console.error(error);
        toast(friendlyError(error), "error", 7000);
    }
});
textInput.addEventListener("input", debounce(render, 200));

async function load() {
    results.innerHTML = loadingState();
    try {
        list = await listByResultStatus(profile.clinicId, tab);
        if (tab === "DELIVERED") list.reverse();
        render();
    } catch (error) {
        console.error(error);
        renderError(results, load);
    }
}

load();
