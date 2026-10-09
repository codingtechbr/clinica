import { initPatientPage } from "./shell.js";
import { appointmentCard, resultCard, bindAppointmentActions } from "./components.js";
import { listMyAppointments } from "../services/appointments-service.js";
import { icon, skeletonList, emptyState, renderError } from "../ui.js";
import { escapeHtml, firstName, pageUrl, ACTIVE_STATUSES, toDate } from "../utils.js";

const { user, profile } = await initPatientPage("home");

const main = document.getElementById("home-content");
let appointments = [];

document.getElementById("greeting").textContent = `Olá, ${firstName(profile.name) || "bem-vindo(a)"}`;

document.getElementById("quick-actions").innerHTML = [
    { label: "Agendar consulta", icon: "stethoscope", href: pageUrl("app/agendar.html", { kind: "CONSULTATION" }) },
    { label: "Agendar exame", icon: "flask", href: pageUrl("app/agendar.html", { kind: "EXAM" }) },
    { label: "Meus resultados", icon: "check", href: pageUrl("app/resultados.html") },
    { label: "Falar com a assistente", icon: "bot", href: pageUrl("app/assistente.html") }
].map((item) => `<a class="quick-card" href="${item.href}">
    <span class="quick-card__icon">${icon(item.icon, 24)}</span>
    <span>${escapeHtml(item.label)}</span>
</a>`).join("");

bindAppointmentActions(main, { user, findAppointment: (id) => appointments.find((a) => a.id === id), onChange: load });

async function load() {
    main.innerHTML = skeletonList(2);
    try {
        appointments = await listMyAppointments(user.uid);
        const ready = appointments.filter((a) => a.resultStatus === "READY");
        const active = appointments
            .filter((a) => ACTIVE_STATUSES.includes(a.status))
            .sort((a, b) => (toDate(a.scheduledFor)?.getTime() ?? Infinity) - (toDate(b.scheduledFor)?.getTime() ?? Infinity));

        if (!appointments.length) {
            main.innerHTML = emptyState({
                title: "Você ainda não tem agendamentos.",
                text: "Peça sua consulta ou exame pelo aplicativo. A recepção marca o horário e te avisa.",
                actionLabel: "Agendar agora",
                actionHref: pageUrl("app/agendar.html"),
                iconName: "calendar"
            });
            return;
        }

        main.innerHTML = `
            ${ready.length ? `<section class="ready-banner">
                <span class="ready-banner__icon">${icon("check", 24)}</span>
                <div><strong>${ready.length === 1 ? "1 resultado pronto" : `${ready.length} resultados prontos`}</strong>
                <small>Retire na recepção com documento com foto.</small></div>
                <a class="btn btn-secondary btn-sm" href="${pageUrl("app/resultados.html")}">Ver</a>
            </section>` : ""}
            <h2 class="section-title">Próximos atendimentos</h2>
            ${active.length ? active.slice(0, 3).map((a) => appointmentCard(a)).join("") : '<p class="hint mb-16">Nenhum atendimento em andamento.</p>'}
            ${appointments.length > 3 ? `<a class="btn btn-secondary" href="${pageUrl("app/agendamentos.html")}">Ver todos os agendamentos</a>` : ""}`;
    } catch (error) {
        console.error(error);
        renderError(main, load, { title: "Não conseguimos carregar seus agendamentos." });
    }
}

load();
