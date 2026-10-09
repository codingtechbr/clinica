// Ficha do paciente: dados, agendamentos, resultados e auditoria.
import { initAdminPage } from "./shell.js";
import { getPatient } from "../services/patients-service.js";
import { listClinicAppointments } from "../services/appointments-service.js";
import { listAuditLogs } from "../services/settings-service.js";
import { icon, statusBadge, resultBadge, renderError, loadingState } from "../ui.js";
import {
    escapeHtml, getParam, pageUrl, formatCPF, formatCNS, formatPhone, formatCEP, formatBirthDate,
    formatDateTime, ROLE_GROUPS, sortByDate, SERVICE_KINDS
} from "../utils.js";

const { profile, content, can } = await initAdminPage("patients", "Paciente");

const patientId = getParam("id");
let tab = "data";
let data = null;

const TABS = [
    { key: "data", label: "Dados pessoais" },
    { key: "appointments", label: "Agendamentos" },
    { key: "results", label: "Resultados" },
    { key: "audit", label: "Auditoria", roles: ROLE_GROUPS.REPORTS }
];

function appointmentsTable(list) {
    return list.length ? `<div class="table-wrap"><table class="table">
        <thead><tr><th>Protocolo</th><th>Atendimento</th><th>Data</th><th>Situação</th><th>Resultado</th></tr></thead>
        <tbody>${list.map((a) => `<tr class="is-clickable" data-href="${pageUrl("admin/agendamento.html", { id: a.id })}">
            <td><strong>${escapeHtml(a.protocol)}</strong></td>
            <td>${escapeHtml(a.serviceName)}<br><small class="text-secondary">${escapeHtml(SERVICE_KINDS[a.kind]?.label || "")}</small></td>
            <td>${a.scheduledFor ? formatDateTime(a.scheduledFor) : "Aguardando horário"}</td>
            <td>${statusBadge(a.status, "admin")}</td>
            <td>${resultBadge(a.resultStatus) || "—"}</td></tr>`).join("")}</tbody></table></div>` : '<p class="hint">Nenhum registro.</p>';
}

function tabContent() {
    const { patient, appointments, audit } = data;
    if (tab === "data") {
        const a = patient.address || {};
        return `<dl class="kv">
            <dt>Nome</dt><dd>${escapeHtml(patient.name)}</dd>
            <dt>CPF</dt><dd>${escapeHtml(formatCPF(patient.cpf))}</dd>
            <dt>CNS</dt><dd>${escapeHtml(formatCNS(patient.cns) || "—")}</dd>
            <dt>Nascimento</dt><dd>${formatBirthDate(patient.birthDate)}</dd>
            <dt>Telefone</dt><dd>${escapeHtml(formatPhone(patient.phone) || "—")}</dd>
            <dt>E-mail</dt><dd>${escapeHtml(patient.email || "—")}</dd>
            <dt>Endereço</dt><dd>${escapeHtml([a.street, a.number, a.district, a.city, a.state].filter(Boolean).join(", ") || "—")}${a.zipCode ? ` · CEP ${escapeHtml(formatCEP(a.zipCode))}` : ""}</dd>
            <dt>Cadastro</dt><dd>${formatDateTime(patient.createdAt)}</dd>
        </dl>`;
    }
    if (tab === "appointments") return appointmentsTable(appointments);
    if (tab === "results") return appointmentsTable(appointments.filter((a) => a.resultStatus));
    if (tab === "audit") {
        if (!audit) return '<p class="hint">Sem permissão para ver a auditoria.</p>';
        return audit.length ? `<div class="table-wrap"><table class="table table--compact">
            <thead><tr><th>Data</th><th>Ação</th><th>Usuário</th><th>Detalhes</th></tr></thead>
            <tbody>${audit.map((l) => `<tr><td>${formatDateTime(l.createdAt)}</td><td>${escapeHtml(l.action)}</td>
                <td>${escapeHtml(l.userName || l.userId)}</td><td><small>${escapeHtml(JSON.stringify(l.newData || {}))}</small></td></tr>`).join("")}</tbody></table></div>`
            : '<p class="hint">Nenhum registro.</p>';
    }
    return "";
}

function render() {
    document.querySelector(".admin-topbar h1").textContent = data.patient.name;
    content.innerHTML = `
        <a class="back-link" href="${pageUrl("admin/pacientes.html")}">${icon("chevronLeft", 18)} Pacientes</a>
        <div class="tabs tabs--inline mb-16" role="tablist">
            ${TABS.filter((t) => !t.roles || can(t.roles)).map((t) => `<button type="button" class="tab" role="tab" data-tab="${t.key}" aria-selected="${t.key === tab}">${t.label}</button>`).join("")}
        </div>
        <section class="panel">${tabContent()}</section>`;
}

content.addEventListener("click", (event) => {
    const tabButton = event.target.closest("[data-tab]");
    if (tabButton) {
        tab = tabButton.dataset.tab;
        render();
        return;
    }
    const row = event.target.closest("tr[data-href]");
    if (row) window.location.href = row.dataset.href;
});

async function load() {
    if (!patientId) {
        renderError(content, null, { title: "Paciente não informado." });
        return;
    }
    content.innerHTML = loadingState();
    try {
        const patient = await getPatient(patientId);
        if (!patient) {
            renderError(content, null, { title: "Paciente não encontrado." });
            return;
        }
        const [appointments, audit] = await Promise.all([
            listClinicAppointments(profile.clinicId, { patientId }),
            can(ROLE_GROUPS.REPORTS) ? listAuditLogs(profile.clinicId, { patientId }).catch(() => null) : null
        ]);
        data = { patient, appointments, audit: audit ? sortByDate(audit, "createdAt", "desc") : null };
        render();
    } catch (error) {
        console.error(error);
        renderError(content, load);
    }
}

load();
