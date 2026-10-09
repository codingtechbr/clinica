// Ficha do agendamento no painel.
import { initAdminPage } from "./shell.js";
import { actionButtonsHtml, runAction } from "./appointment-actions.js";
import {
    getAppointment, listAppointmentDocuments, listAppointmentHistory, reviewDocument
} from "../services/appointments-service.js";
import { getFileUrl, isImagePath } from "../services/storage-service.js";
import { buildTimeline, renderTimeline } from "../timeline.js";
import {
    icon, statusBadge, resultBadge, toneBadge, renderError, loadingState, openModal, toast, setButtonLoading,
    printFile, printButtonHtml
} from "../ui.js";
import {
    escapeHtml, getParam, pageUrl, STATUS, SERVICE_KINDS, PERIODS, PAYMENT_TYPES, DOCUMENT_TYPES, DOCUMENT_STATUS,
    formatDate, formatDateTime, formatBirthDate, formatCPF, formatPhone, formatMoney, friendlyError, userError, ROLE_GROUPS
} from "../utils.js";

const { actor, content, can } = await initAdminPage("agenda", "Agendamento");

const id = getParam("id");
let appointment = null;
let documents = [];
let history = [];

function documentsHtml() {
    if (!documents.length) return '<p class="hint">Nenhum documento enviado.</p>';
    const canReview = can(ROLE_GROUPS.SCHEDULING);
    return documents.map((d) => {
        const st = DOCUMENT_STATUS[d.status] || DOCUMENT_STATUS.PENDING;
        return `<div class="doc-item">
            <span class="doc-item__icon">${icon("file", 22)}</span>
            <div class="doc-item__info">
                <strong>${escapeHtml(DOCUMENT_TYPES[d.type] || d.type)}</strong>
                <small>${escapeHtml(d.fileName || "")} · ${formatDateTime(d.uploadedAt)}</small>
                ${d.reviewReason ? `<small class="text-danger">Motivo: ${escapeHtml(d.reviewReason)}</small>` : ""}
            </div>
            <div class="doc-item__actions">
                <span class="badge badge--${st.tone}">${st.label}</span>
                <button type="button" class="btn btn-secondary btn-sm" data-view="${escapeHtml(d.id)}">${icon("eye", 16)} Ver</button>
                ${canReview && d.status === "PENDING" ? `
                    <button type="button" class="btn btn-primary btn-sm" data-approve="${escapeHtml(d.id)}">${icon("check", 16)} Conferido</button>
                    <button type="button" class="btn btn-danger btn-sm" data-reject="${escapeHtml(d.id)}">${icon("x", 16)} Recusar</button>` : ""}
            </div>
        </div>`;
    }).join("");
}

function render() {
    const a = appointment;
    const pay = a.payment?.type === "INSURANCE"
        ? `${escapeHtml(a.payment.insuranceName)} · carteirinha ${escapeHtml(a.payment.cardNumber || "")}`
        : `${PAYMENT_TYPES.PRIVATE}${formatMoney(a.price) ? ` · ${formatMoney(a.price)}` : ""}`;
    document.querySelector(".admin-topbar h1").textContent = `Agendamento ${a.protocol}`;
    content.innerHTML = `
        <div class="page-toolbar no-print">
            <a class="back-link" href="${pageUrl(a.status === "REQUESTED" ? "admin/pedidos.html" : "admin/agenda.html")}">${icon("chevronLeft", 18)} Voltar</a>
            <button type="button" class="btn btn-secondary btn-sm" data-print-page>${icon("printer", 16)} Imprimir</button>
        </div>
        <section class="panel request-hero">
            <div class="request-hero__main">
                <p class="hint">${escapeHtml(SERVICE_KINDS[a.kind]?.label || "")} · Protocolo ${escapeHtml(a.protocol)}</p>
                <h2 class="request-hero__title">${escapeHtml(a.serviceName)}</h2>
                <div class="badge-row">${statusBadge(a.status, "admin")} ${a.kind === "EXAM" ? resultBadge(a.resultStatus) : ""}</div>
                ${a.scheduledFor ? `<p class="mt-16"><strong>${formatDateTime(a.scheduledFor)}</strong>${a.professional ? ` · ${escapeHtml(a.professional)}` : ""}${a.location ? ` · ${escapeHtml(a.location)}` : ""}</p>` : ""}
            </div>
            <div class="actions-bar no-print">${actionButtonsHtml(a, can)}</div>
        </section>

        <div class="detail-grid">
            <div>
                <section class="panel">
                    <h2 class="panel__title">Documentos</h2>
                    ${documentsHtml()}
                </section>
                <section class="panel">
                    <h2 class="panel__title">Histórico</h2>
                    ${history.length ? `<div class="table-wrap"><table class="table table--compact">
                        <thead><tr><th>Data</th><th>Situação</th><th>Responsável</th><th>Observação</th></tr></thead>
                        <tbody>${[...history].reverse().map((h) => `<tr>
                            <td>${formatDateTime(h.createdAt)}</td>
                            <td>${escapeHtml(STATUS[h.newStatus]?.admin || h.newStatus || "")}</td>
                            <td>${escapeHtml(h.changedByName || "—")}</td>
                            <td>${escapeHtml(h.reason || "")}</td></tr>`).join("")}</tbody></table></div>` : '<p class="hint">Sem registros.</p>'}
                </section>
            </div>
            <div>
                <section class="panel">
                    <h2 class="panel__title">Paciente</h2>
                    <dl class="kv kv--stacked">
                        <dt>Nome</dt><dd><a href="${pageUrl("admin/paciente.html", { id: a.patientId })}">${escapeHtml(a.patientName)}</a></dd>
                        <dt>CPF</dt><dd>${escapeHtml(formatCPF(a.patientCpf))}</dd>
                        <dt>Telefone</dt><dd>${escapeHtml(formatPhone(a.patientPhone) || "—")}</dd>
                    </dl>
                </section>
                <section class="panel">
                    <h2 class="panel__title">Pedido</h2>
                    <dl class="kv kv--stacked">
                        <dt>Pagamento</dt><dd>${pay}</dd>
                        <dt>Preferência</dt><dd>${a.preferredDate ? formatBirthDate(a.preferredDate) : "Primeira data disponível"} · ${escapeHtml(PERIODS[a.preferredPeriod] || "")}</dd>
                        <dt>Enviado em</dt><dd>${formatDateTime(a.requestedAt || a.createdAt)}</dd>
                        ${a.notes ? `<dt>Observações do paciente</dt><dd>${escapeHtml(a.notes)}</dd>` : ""}
                        ${a.instructions ? `<dt>Orientações enviadas</dt><dd>${escapeHtml(a.instructions)}</dd>` : ""}
                        ${a.resultEstimatedAt ? `<dt>Previsão do resultado</dt><dd>${formatDate(a.resultEstimatedAt)}</dd>` : ""}
                        ${a.cancelReason ? `<dt>Motivo do cancelamento</dt><dd>${escapeHtml(a.cancelReason)}</dd>` : ""}
                    </dl>
                </section>
                <section class="panel">
                    <h2 class="panel__title">Linha do tempo (visão do paciente)</h2>
                    ${renderTimeline(buildTimeline(a, history))}
                </section>
            </div>
        </div>`;
}

async function viewDocument(d) {
    const url = await getFileUrl(d.storagePath);
    const isImage = isImagePath(d.storagePath);
    const title = `${DOCUMENT_TYPES[d.type] || "Documento"} · ${appointment.patientName} · ${appointment.protocol}`;
    openModal({
        title: DOCUMENT_TYPES[d.type] || "Documento",
        wide: true,
        hideConfirm: true,
        body: `${isImage ? `<img class="doc-preview" src="${escapeHtml(url)}" alt="">` : `<iframe class="doc-frame" src="${escapeHtml(url)}" title="Documento"></iframe>`}
            <div class="actions-bar">${printButtonHtml()}
            <a class="btn btn-secondary mt-16" href="${escapeHtml(url)}" target="_blank" rel="noopener">${icon("download", 18)} Abrir em nova aba</a></div>`,
        onOpen: (form) => form.querySelector("[data-print]").addEventListener("click", () => printFile(url, { isImage, title }))
    });
}

async function rejectDocument(d) {
    return openModal({
        title: `Recusar: ${DOCUMENT_TYPES[d.type] || "Documento"}`,
        confirmLabel: "Recusar e avisar paciente",
        danger: true,
        body: `<div class="field"><label for="reason">Motivo (o paciente verá)</label>
            <select id="reason" name="reason" class="input">
                <option>Foto ilegível</option><option>Documento incorreto</option><option>Pedido médico vencido</option>
                <option>Carteirinha vencida ou ilegível</option><option>Outro</option></select></div>
            <div class="field"><label for="details">Detalhes</label><textarea id="details" name="details" class="input" rows="2"></textarea></div>`,
        onConfirm: async (form) => {
            const data = Object.fromEntries(new FormData(form));
            const details = data.details.trim();
            if (data.reason === "Outro" && !details) throw userError("Descreva o motivo.");
            await reviewDocument({ appointment, document: d, actor, approved: false, reason: data.reason === "Outro" ? details : [data.reason, details].filter(Boolean).join(". ") });
        }
    });
}

content.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button || button.disabled) return;
    if (button.hasAttribute("data-print-page")) {
        window.print();
        return;
    }
    const find = (docId) => documents.find((d) => d.id === docId);
    try {
        if (button.dataset.action) {
            if (await runAction(button.dataset.action, appointment, actor)) await load();
        } else if (button.dataset.view) {
            setButtonLoading(button, true, "Abrindo...");
            await viewDocument(find(button.dataset.view));
            setButtonLoading(button, false);
        } else if (button.dataset.approve) {
            setButtonLoading(button, true, "Salvando...");
            await reviewDocument({ appointment, document: find(button.dataset.approve), actor, approved: true });
            await load();
        } else if (button.dataset.reject) {
            if (await rejectDocument(find(button.dataset.reject))) {
                toast("Documento recusado. O paciente foi avisado.", "success");
                await load();
            }
        }
    } catch (error) {
        console.error(error);
        setButtonLoading(button, false);
        toast(friendlyError(error), "error", 7000);
    }
});

async function load() {
    if (!id) {
        renderError(content, null, { title: "Agendamento não informado." });
        return;
    }
    content.innerHTML = loadingState();
    try {
        appointment = await getAppointment(id);
        if (!appointment) {
            renderError(content, null, { title: "Agendamento não encontrado." });
            return;
        }
        [documents, history] = await Promise.all([listAppointmentDocuments(id), listAppointmentHistory(id)]);
        render();
    } catch (error) {
        console.error(error);
        renderError(content, load, { title: error.code === "permission-denied" ? "Sem acesso a este agendamento." : "Não foi possível carregar." });
    }
}

load();
