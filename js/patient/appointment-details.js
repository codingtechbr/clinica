// Detalhe do agendamento: status, linha do tempo, preparo, resultado e documentos.
import { initPatientPage } from "./shell.js";
import { appointmentCard, bindAppointmentActions } from "./components.js";
import { fileSlotHtml, bindFileSlots } from "./file-slot.js";
import {
    getAppointment, listAppointmentDocuments, listAppointmentHistory, addPatientDocuments
} from "../services/appointments-service.js";
import { getFileUrl, isImagePath } from "../services/storage-service.js";
import { buildTimeline, renderTimeline } from "../timeline.js";
import { icon, toast, setButtonLoading, loadingState, renderError, openModal, printFile, printButtonHtml } from "../ui.js";
import {
    escapeHtml, getParam, pageUrl, STATUS, RESULT_STATUS, DOCUMENT_TYPES, DOCUMENT_STATUS, ACTIVE_STATUSES,
    formatDate, friendlyError
} from "../utils.js";

const { user } = await initPatientPage("appointments");

const main = document.getElementById("main");
const id = getParam("id");
const newFiles = {};
let appointment = null;
let documents = [];

bindFileSlots(main, newFiles, () => renderUpload());
bindAppointmentActions(main, { user, findAppointment: () => appointment, onChange: load });

function rejectedDocs() {
    return documents.filter((d) => d.status === "REJECTED" && !documents.some((x) => x.type === d.type && x.status !== "REJECTED" && (x.uploadedAt?.seconds || 0) > (d.uploadedAt?.seconds || 0)));
}

function uploadHtml() {
    if (!ACTIVE_STATUSES.includes(appointment.status)) return "";
    const rejected = rejectedDocs();
    const types = rejected.length ? [...new Set(rejected.map((d) => d.type))] : ["OTHER"];
    const ready = Object.keys(newFiles).length > 0;
    return `<section class="card">
        <h2 class="section-title">${rejected.length ? "Reenviar documento" : "Enviar outro documento"}</h2>
        ${rejected.map((d) => `<p class="alert alert--warning">${icon("alert", 18)} <span>${escapeHtml(DOCUMENT_TYPES[d.type] || "Documento")}: ${escapeHtml(d.reviewReason || "precisa ser reenviado")}</span></p>`).join("")}
        ${types.map((t) => fileSlotHtml({ key: t, label: DOCUMENT_TYPES[t] || "Documento", required: rejected.length > 0, file: newFiles[t] })).join("")}
        <div id="upload-progress" class="upload-progress" hidden><div class="progress"><div class="progress__bar" id="upload-bar"></div></div></div>
        <button type="button" class="btn btn-primary" id="send-docs" ${ready ? "" : "disabled"}>${icon("upload", 20)} Enviar</button>
    </section>`;
}

function renderUpload() {
    const box = document.getElementById("upload-box");
    if (box) box.innerHTML = uploadHtml();
}

function resultHtml() {
    if (appointment.kind !== "EXAM" || !appointment.resultStatus) return "";
    const info = RESULT_STATUS[appointment.resultStatus];
    return `<section class="alert ${appointment.resultStatus === "READY" ? "alert--success" : "alert--info"}">
        ${icon(appointment.resultStatus === "READY" ? "check" : "flask", 22)}
        <div><h2 class="alert__title">Resultado: ${escapeHtml(info.label)}</h2>
        <p>${escapeHtml(info.description)}</p>
        ${appointment.resultStatus === "IN_ANALYSIS" && appointment.resultEstimatedAt ? `<p><strong>Previsão: ${formatDate(appointment.resultEstimatedAt)}</strong></p>` : ""}
        ${appointment.resultNote ? `<p>${escapeHtml(appointment.resultNote)}</p>` : ""}</div>
    </section>`;
}

function render(history) {
    const status = STATUS[appointment.status] || {};
    document.getElementById("page-title").textContent = appointment.serviceName;
    main.innerHTML = `
        ${appointmentCard(appointment, { link: false })}
        ${status.description ? `<p class="hint mb-16">${escapeHtml(status.description)}</p>` : ""}
        ${resultHtml()}
        ${appointment.instructions ? `<section class="alert alert--info">${icon("info", 20)}<div><strong>Orientações da clínica</strong><p>${escapeHtml(appointment.instructions)}</p></div></section>` : ""}
        ${appointment.preparation && ACTIVE_STATUSES.includes(appointment.status) ? `<section class="alert alert--warning">${icon("alert", 20)}<div><strong>Preparo do exame</strong><p>${escapeHtml(appointment.preparation)}</p></div></section>` : ""}
        ${appointment.cancelReason ? `<p class="hint mb-16">Motivo do cancelamento: ${escapeHtml(appointment.cancelReason)}</p>` : ""}

        <section class="card">
            <h2 class="section-title">Andamento</h2>
            ${renderTimeline(buildTimeline(appointment, history))}
        </section>

        <section class="card">
            <h2 class="section-title">Documentos enviados</h2>
            ${documents.length ? `<ul class="doc-list">${documents.map((d) => {
                const st = DOCUMENT_STATUS[d.status] || DOCUMENT_STATUS.PENDING;
                return `<li class="doc-list__item">
                    <span class="doc-list__icon">${icon("file", 20)}</span>
                    <div class="doc-list__info"><strong>${escapeHtml(DOCUMENT_TYPES[d.type] || d.type)}</strong><small>${formatDate(d.uploadedAt)}</small></div>
                    <div class="doc-list__side"><span class="badge badge--${st.tone}">${st.label}</span>
                        <button type="button" class="link-btn" data-view="${escapeHtml(d.id)}">Ver</button></div>
                </li>`;
            }).join("")}</ul>` : '<p class="hint">Nenhum documento enviado.</p>'}
        </section>

        <div id="upload-box">${uploadHtml()}</div>

        ${ACTIVE_STATUSES.includes(appointment.status) ? `<button type="button" class="btn btn-danger-outline mb-16" data-cancel="${escapeHtml(appointment.id)}">${icon("x", 18)} Cancelar agendamento</button>` : ""}

        <a class="card card--interactive assistant-banner" href="${pageUrl("app/assistente.html")}">
            <span class="assistant-banner__icon">${icon("bot", 24)}</span>
            <span><strong>Ficou com dúvida?</strong><small>Pergunte à assistente da clínica</small></span>
            ${icon("chevronRight", 20)}
        </a>`;
}

main.addEventListener("click", async (event) => {
    const viewButton = event.target.closest("[data-view]");
    if (viewButton) {
        const d = documents.find((x) => x.id === viewButton.dataset.view);
        try {
            setButtonLoading(viewButton, true, "Abrindo...");
            const url = await getFileUrl(d.storagePath);
            setButtonLoading(viewButton, false);
            const isImage = isImagePath(d.storagePath);
            openModal({
                title: DOCUMENT_TYPES[d.type] || "Documento",
                hideConfirm: true,
                body: `${isImage ? `<img class="doc-preview" src="${escapeHtml(url)}" alt="">` : "<p>Arquivo PDF.</p>"}
                    ${printButtonHtml()}
                    <a class="btn btn-secondary mt-16" href="${escapeHtml(url)}" target="_blank" rel="noopener">${icon("download", 18)} Abrir arquivo</a>`,
                onOpen: (form) => form.querySelector("[data-print]").addEventListener("click", () => printFile(url, { isImage, title: DOCUMENT_TYPES[d.type] || "Documento" }))
            });
        } catch (error) {
            console.error(error);
            setButtonLoading(viewButton, false);
            toast(friendlyError(error, "Não foi possível abrir o documento."), "error");
        }
        return;
    }
    const sendButton = event.target.closest("#send-docs");
    if (sendButton) {
        const files = Object.entries(newFiles).map(([type, file]) => ({ type, file }));
        try {
            setButtonLoading(sendButton, true, "Enviando...");
            document.getElementById("upload-progress").hidden = false;
            await addPatientDocuments({ user, appointment, files }, (p) => { document.getElementById("upload-bar").style.width = `${p}%`; });
            Object.keys(newFiles).forEach((k) => delete newFiles[k]);
            toast("Documento enviado.", "success");
            await load();
        } catch (error) {
            console.error(error);
            setButtonLoading(sendButton, false);
            toast(friendlyError(error), "error", 7000);
        }
    }
});

async function load() {
    if (!id) {
        renderError(main, null, { title: "Agendamento não informado." });
        return;
    }
    main.innerHTML = loadingState();
    try {
        appointment = await getAppointment(id);
        if (!appointment) {
            renderError(main, null, { title: "Agendamento não encontrado." });
            return;
        }
        const [docs, history] = await Promise.all([listAppointmentDocuments(id), listAppointmentHistory(id)]);
        documents = docs;
        render(history);
    } catch (error) {
        console.error(error);
        renderError(main, load, { title: error.code === "permission-denied" ? "Você não tem acesso a este agendamento." : "Não conseguimos carregar o agendamento." });
    }
}

load();
