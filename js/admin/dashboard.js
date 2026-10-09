import { initAdminPage } from "./shell.js";
import { countAppointments, listClinicAppointments } from "../services/appointments-service.js";
import { icon, renderError, statusBadge } from "../ui.js";
import { escapeHtml, pageUrl, isSameDay, formatTime, SERVICE_KINDS } from "../utils.js";

const { profile, content } = await initAdminPage("dashboard", "Dashboard");

const INDICATORS = [
    { label: "Pedidos aguardando horário", field: "status", value: "REQUESTED", icon: "list", href: "admin/pedidos.html" },
    { label: "Agendados (sem confirmação)", field: "status", value: "SCHEDULED", icon: "calendar", href: "admin/agenda.html" },
    { label: "Presença confirmada", field: "status", value: "CONFIRMED", icon: "check", href: "admin/agenda.html" },
    { label: "Resultados em análise", field: "resultStatus", value: "IN_ANALYSIS", icon: "flask", href: "admin/resultados.html" },
    { label: "Prontos para retirada", field: "resultStatus", value: "READY", icon: "check", href: "admin/resultados.html" },
    { label: "Não compareceram", field: "status", value: "NO_SHOW", icon: "x", href: "admin/agenda.html" }
];

async function load() {
    content.innerHTML = `<div class="stat-grid">${INDICATORS.map(() => '<div class="stat-card skeleton"></div>').join("")}</div>`;
    try {
        const counts = await Promise.all(INDICATORS.map((i) => countAppointments(profile.clinicId, i.field, i.value)));
        const [scheduled, confirmed] = await Promise.all([
            listClinicAppointments(profile.clinicId, { status: "SCHEDULED" }),
            listClinicAppointments(profile.clinicId, { status: "CONFIRMED" })
        ]);
        const today = [...scheduled, ...confirmed]
            .filter((a) => isSameDay(a.scheduledFor, new Date()))
            .sort((a, b) => a.scheduledFor.seconds - b.scheduledFor.seconds);

        content.innerHTML = `
            <div class="stat-grid">
                ${INDICATORS.map((ind, i) => `
                    <a class="stat-card" href="${pageUrl(ind.href)}">
                        <span class="stat-card__icon">${icon(ind.icon, 20)}</span>
                        <p class="stat-card__label">${escapeHtml(ind.label)}</p>
                        <p class="stat-card__value">${counts[i].toLocaleString("pt-BR")}</p>
                    </a>`).join("")}
                <a class="stat-card stat-card--accent" href="${pageUrl("admin/agenda.html")}">
                    <span class="stat-card__icon">${icon("clock", 20)}</span>
                    <p class="stat-card__label">Atendimentos de hoje</p>
                    <p class="stat-card__value">${today.length.toLocaleString("pt-BR")}</p>
                </a>
            </div>
            <section class="panel mt-24">
                <div class="panel__header">
                    <h2 class="panel__title">Agenda de hoje</h2>
                    <a class="btn btn-secondary btn-sm" href="${pageUrl("admin/agenda.html")}">Abrir agenda</a>
                </div>
                ${today.length ? `<div class="table-wrap"><table class="table">
                    <thead><tr><th>Horário</th><th>Paciente</th><th>Atendimento</th><th>Profissional</th><th>Situação</th></tr></thead>
                    <tbody>${today.map((a) => `<tr class="is-clickable" data-href="${pageUrl("admin/agendamento.html", { id: a.id })}">
                        <td><strong>${formatTime(a.scheduledFor)}</strong></td>
                        <td>${escapeHtml(a.patientName)}</td>
                        <td>${escapeHtml(a.serviceName)}<br><small class="text-secondary">${escapeHtml(SERVICE_KINDS[a.kind]?.label || "")}</small></td>
                        <td>${escapeHtml(a.professional || "—")}</td>
                        <td>${statusBadge(a.status, "admin")}</td>
                    </tr>`).join("")}</tbody></table></div>` : '<p class="hint">Nenhum atendimento marcado para hoje.</p>'}
            </section>`;
    } catch (error) {
        console.error(error);
        renderError(content, load, { title: "Não foi possível carregar os indicadores." });
    }
}

content.addEventListener("click", (event) => {
    const row = event.target.closest("tr[data-href]");
    if (row) window.location.href = row.dataset.href;
});

load();
