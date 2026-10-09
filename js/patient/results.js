// Resultados de exames: somente o status (em análise / pronto para retirada / entregue).
import { initPatientPage } from "./shell.js";
import { resultCard } from "./components.js";
import { listMyAppointments } from "../services/appointments-service.js";
import { skeletonList, emptyState, renderError } from "../ui.js";
import { pageUrl } from "../utils.js";

const { user } = await initPatientPage("results");

const main = document.getElementById("main");
const ORDER = { READY: 0, IN_ANALYSIS: 1, DELIVERED: 2 };

async function load() {
    main.innerHTML = skeletonList(3);
    try {
        const exams = (await listMyAppointments(user.uid))
            .filter((a) => a.kind === "EXAM" && a.resultStatus)
            .sort((a, b) => (ORDER[a.resultStatus] ?? 9) - (ORDER[b.resultStatus] ?? 9));
        if (!exams.length) {
            main.innerHTML = emptyState({
                title: "Nenhum resultado por enquanto.",
                text: "Depois que você fizer um exame na clínica, o andamento do resultado aparece aqui.",
                actionLabel: "Agendar exame",
                actionHref: pageUrl("app/agendar.html", { kind: "EXAM" }),
                iconName: "flask"
            });
            return;
        }
        const ready = exams.filter((a) => a.resultStatus === "READY");
        const analysis = exams.filter((a) => a.resultStatus === "IN_ANALYSIS");
        const delivered = exams.filter((a) => a.resultStatus === "DELIVERED");
        const section = (title, list) => list.length ? `<h2 class="section-title">${title}</h2>${list.map(resultCard).join("")}` : "";
        main.innerHTML = `
            <p class="hint mb-16">Os resultados são retirados na recepção da clínica, com documento com foto. O aplicativo informa quando estão prontos.</p>
            ${section("Prontos para retirada", ready)}
            ${section("Em análise", analysis)}
            ${section("Entregues", delivered)}`;
    } catch (error) {
        console.error(error);
        renderError(main, load, { title: "Não conseguimos carregar seus resultados." });
    }
}

load();
