import { initPatientPage } from "./shell.js";
import { appointmentCard, bindAppointmentActions } from "./components.js";
import { listMyAppointments } from "../services/appointments-service.js";
import { skeletonList, emptyState, renderError } from "../ui.js";
import { pageUrl, ACTIVE_STATUSES, toDate } from "../utils.js";

const { user } = await initPatientPage("appointments");

const list = document.getElementById("list");
const tabs = document.querySelectorAll("[data-tab]");
let appointments = [];
let tab = "active";

tabs.forEach((button) => button.addEventListener("click", () => {
    tab = button.dataset.tab;
    tabs.forEach((t) => t.setAttribute("aria-selected", String(t === button)));
    render();
}));

bindAppointmentActions(list, { user, findAppointment: (id) => appointments.find((a) => a.id === id), onChange: load });

function render() {
    if (!appointments.length) {
        list.innerHTML = emptyState({
            title: "Você ainda não tem agendamentos.",
            text: "Peça sua consulta ou exame e acompanhe por aqui.",
            actionLabel: "Agendar agora",
            actionHref: pageUrl("app/agendar.html"),
            iconName: "calendar"
        });
        return;
    }
    const filtered = appointments.filter((a) => (tab === "active") === ACTIVE_STATUSES.includes(a.status));
    if (tab === "active") {
        filtered.sort((a, b) => (toDate(a.scheduledFor)?.getTime() ?? Infinity) - (toDate(b.scheduledFor)?.getTime() ?? Infinity));
    }
    list.innerHTML = filtered.length
        ? filtered.map((a) => appointmentCard(a)).join("")
        : emptyState({ title: tab === "active" ? "Nenhum agendamento em andamento." : "Nenhum atendimento anterior.", iconName: "check" });
}

async function load() {
    list.innerHTML = skeletonList(3);
    try {
        appointments = await listMyAppointments(user.uid);
        render();
    } catch (error) {
        console.error(error);
        renderError(list, load, { title: "Não conseguimos carregar seus agendamentos." });
    }
}

load();
