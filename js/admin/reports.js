// Relatórios simples + exportação CSV.
import { initAdminPage } from "./shell.js";
import { listClinicAppointments } from "../services/appointments-service.js";
import { icon, renderError, loadingState } from "../ui.js";
import {
    escapeHtml, STATUS, SERVICE_KINDS, RESULT_STATUS, ROLE_GROUPS, toDate, formatDate, formatDateTime, formatCPF,
    toDateInputValue, formatMoney
} from "../utils.js";

const { profile, content } = await initAdminPage("reports", "Relatórios", ROLE_GROUPS.REPORTS);

let appointments = [];

function countBy(list, keyFn) {
    const map = new Map();
    list.forEach((item) => {
        const key = keyFn(item);
        map.set(key, (map.get(key) || 0) + 1);
    });
    return [...map].sort((a, b) => b[1] - a[1]);
}

function barTable(title, rows, total) {
    return `<section class="panel">
        <h2 class="panel__title">${escapeHtml(title)}</h2>
        ${rows.length ? `<table class="table table--bars"><tbody>${rows.map(([label, value]) => `<tr>
            <th scope="row">${escapeHtml(label)}</th>
            <td class="bar-cell"><span class="bar" style="width:${total ? Math.max(2, (value / total) * 100) : 0}%"></span></td>
            <td class="num">${value.toLocaleString("pt-BR")}</td></tr>`).join("")}</tbody></table>` : '<p class="hint">Sem dados no período.</p>'}
    </section>`;
}

function filtered() {
    const from = new Date(`${document.getElementById("r-from").value}T00:00:00`);
    const to = new Date(`${document.getElementById("r-to").value}T23:59:59`);
    return appointments.filter((a) => {
        const d = toDate(a.requestedAt || a.createdAt);
        return d && d >= from && d <= to;
    });
}

function render() {
    const list = filtered();
    const completed = list.filter((a) => a.status === "COMPLETED");
    const noShow = list.filter((a) => a.status === "NO_SHOW").length;
    const privateRevenue = completed.filter((a) => a.payment?.type === "PRIVATE").reduce((sum, a) => sum + (Number(a.price) || 0), 0);
    const waits = list.filter((a) => a.scheduledFor).map((a) => (toDate(a.scheduledFor) - toDate(a.requestedAt || a.createdAt)) / 86400000).filter((n) => n >= 0);
    const avgWait = waits.length ? waits.reduce((a, b) => a + b, 0) / waits.length : null;

    document.getElementById("report-body").innerHTML = `
        <div class="stat-grid mb-16">
            <div class="stat-card"><p class="stat-card__label">Pedidos no período</p><p class="stat-card__value">${list.length}</p></div>
            <div class="stat-card"><p class="stat-card__label">Realizados</p><p class="stat-card__value">${completed.length}</p></div>
            <div class="stat-card"><p class="stat-card__label">Faltas</p><p class="stat-card__value">${noShow}</p></div>
            <div class="stat-card"><p class="stat-card__label">Particular realizado (estimado)</p><p class="stat-card__value">${formatMoney(privateRevenue) || "R$ 0,00"}</p></div>
            <div class="stat-card"><p class="stat-card__label">Tempo médio até o atendimento</p><p class="stat-card__value">${avgWait === null ? "—" : `${avgWait.toFixed(1).replace(".", ",")} dias`}</p></div>
        </div>
        <div class="report-grid">
            ${barTable("Por situação", countBy(list, (a) => STATUS[a.status]?.admin || a.status), list.length)}
            ${barTable("Por exame/consulta", countBy(list, (a) => a.serviceName), list.length)}
            ${barTable("Por pagamento", countBy(list, (a) => (a.payment?.type === "INSURANCE" ? a.payment.insuranceName : "Particular")), list.length)}
            ${barTable("Resultados", countBy(list.filter((a) => a.resultStatus), (a) => RESULT_STATUS[a.resultStatus]?.label), list.filter((a) => a.resultStatus).length)}
        </div>`;
}

function csvCell(value) {
    const text = String(value ?? "");
    return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function exportCsv() {
    const header = ["Protocolo", "Paciente", "CPF", "Atendimento", "Tipo", "Pagamento", "Situação", "Resultado", "Pedido em", "Agendado para", "Profissional"];
    const rows = filtered().map((a) => [
        a.protocol, a.patientName, formatCPF(a.patientCpf), a.serviceName, SERVICE_KINDS[a.kind]?.label,
        a.payment?.type === "INSURANCE" ? a.payment.insuranceName : "Particular", STATUS[a.status]?.admin,
        RESULT_STATUS[a.resultStatus]?.label || "", formatDate(a.requestedAt || a.createdAt),
        a.scheduledFor ? formatDateTime(a.scheduledFor) : "", a.professional || ""
    ]);
    const csv = "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `agendamentos-${toDateInputValue()}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function load() {
    content.innerHTML = loadingState();
    try {
        appointments = await listClinicAppointments(profile.clinicId);
        const start = new Date();
        start.setDate(start.getDate() - 30);
        content.innerHTML = `
            <section class="panel no-print">
                <div class="filters">
                    <div class="field"><label for="r-from">De</label><input id="r-from" type="date" class="input" value="${toDateInputValue(start)}"></div>
                    <div class="field"><label for="r-to">Até</label><input id="r-to" type="date" class="input" value="${toDateInputValue()}"></div>
                    <div class="field field--action"><button type="button" class="btn btn-secondary" id="export">${icon("download", 18)} Exportar CSV</button></div>
                    <div class="field field--action"><button type="button" class="btn btn-secondary" id="print">${icon("printer", 18)} Imprimir</button></div>
                </div>
                <p class="hint">O CSV contém dados pessoais. Compartilhe apenas com pessoas autorizadas (LGPD).</p>
            </section>
            <div id="report-body"></div>`;
        document.getElementById("r-from").addEventListener("change", render);
        document.getElementById("r-to").addEventListener("change", render);
        document.getElementById("export").addEventListener("click", exportCsv);
        document.getElementById("print").addEventListener("click", () => window.print());
        render();
    } catch (error) {
        console.error(error);
        renderError(content, load);
    }
}

load();
