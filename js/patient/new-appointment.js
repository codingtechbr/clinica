// Pedido de agendamento: tipo > serviço > pagamento > preferência > documentos > revisão > protocolo.
import { initPatientPage } from "./shell.js";
import { fileSlotHtml, bindFileSlots } from "./file-slot.js";
import { listServices, listInsurances } from "../services/catalog-service.js";
import { getPatient } from "../services/patients-service.js";
import { createAppointmentRequest } from "../services/appointments-service.js";
import { icon, toast, setButtonLoading, loadingState, renderError, emptyState } from "../ui.js";
import {
    SERVICE_KINDS, DOCUMENT_TYPES, PERIODS, PAYMENT_TYPES, escapeHtml, normalizeText, getParam, pageUrl,
    friendlyError, maskCPF, debounce, formatMoney, formatBirthDate, toDateInputValue
} from "../utils.js";

const { user, profile } = await initPatientPage("new");

const main = document.getElementById("main");
const backButton = document.getElementById("back-button");
const TOTAL_STEPS = 6;

const state = {
    step: 0,
    kind: null,
    service: null,
    search: "",
    payment: { type: null, insuranceId: "", insuranceName: "", cardNumber: "" },
    preferredDate: "",
    preferredPeriod: "ANY",
    files: {},
    notes: "",
    accepted: false,
    sending: false,
    done: null
};

let services = [];
let insurances = [];
let patient = null;

/* ---------- Navegação entre etapas (botão voltar do celular funciona) ---------- */

function goTo(step) {
    state.step = step;
    history.pushState({ step }, "");
    render();
    window.scrollTo(0, 0);
}

window.addEventListener("popstate", (event) => {
    if (state.sending) {
        history.pushState({ step: state.step }, "");
        return;
    }
    if (state.done) {
        window.location.href = pageUrl("app/home.html");
        return;
    }
    state.step = event.state?.step ?? 0;
    render();
});

backButton.addEventListener("click", (event) => {
    event.preventDefault();
    if (state.sending) return;
    if (state.done || state.step === 0) window.location.href = pageUrl("app/home.html");
    else history.back();
});

const initialKind = getParam("kind");
if (initialKind && SERVICE_KINDS[initialKind]) {
    state.kind = initialKind;
    history.replaceState({ step: 0 }, "");
    history.pushState({ step: 1 }, "");
    state.step = 1;
} else {
    history.replaceState({ step: 0 }, "");
}

bindFileSlots(main, state.files, () => render());

/* ---------- Etapas ---------- */

function progress() {
    const step = state.step + 1;
    return `<div class="wizard-progress">
        <p class="wizard-progress__label">Etapa ${step} de ${TOTAL_STEPS}</p>
        <div class="progress" role="progressbar" aria-valuemin="1" aria-valuemax="${TOTAL_STEPS}" aria-valuenow="${step}" aria-label="Progresso do agendamento">
            <div class="progress__bar" style="width:${(step / TOTAL_STEPS) * 100}%"></div>
        </div>
    </div>`;
}

function stepKind() {
    return `${progress()}
        <h1 class="step-title">O que você quer agendar?</h1>
        <p class="step-subtitle">Escolha uma opção.</p>
        <div class="option-list">
            ${Object.entries(SERVICE_KINDS).map(([key, kind]) => `
                <button type="button" class="option ${state.kind === key ? "option--selected" : ""}" data-kind="${key}">
                    <span class="option__icon">${icon(kind.icon, 24)}</span>
                    <span class="option__text"><strong>${kind.label}</strong><small>${escapeHtml(kind.description)}</small></span>
                    ${icon("chevronRight", 20, "option__chevron")}
                </button>`).join("")}
        </div>`;
}

function serviceListHtml() {
    const term = normalizeText(state.search);
    const list = services.filter((s) => s.kind === state.kind && (!term || normalizeText(`${s.name} ${s.specialty}`).includes(term)));
    if (!list.length) {
        return state.search
            ? `<p class="hint text-center">Nada encontrado para “${escapeHtml(state.search)}”.</p>`
            : emptyState({ title: "Nenhuma opção disponível", text: "A clínica ainda não cadastrou este tipo de atendimento. Fale com a recepção.", iconName: "info" });
    }
    return list.map((s) => `
        <button type="button" class="option option--compact ${state.service?.id === s.id ? "option--selected" : ""}" data-service="${escapeHtml(s.id)}">
            <span class="option__text"><strong>${escapeHtml(s.name)}</strong>
                <small>${escapeHtml(s.specialty || "")}${formatMoney(s.price) ? ` · Particular ${formatMoney(s.price)}` : ""}</small></span>
            ${icon("chevronRight", 20, "option__chevron")}
        </button>`).join("");
}

function stepService() {
    const kind = SERVICE_KINDS[state.kind];
    return `${progress()}
        <h1 class="step-title">${state.kind === "EXAM" ? "Qual exame?" : "Qual consulta?"}</h1>
        <p class="step-subtitle">${kind.plural} disponíveis na clínica.</p>
        <div class="search-field">
            ${icon("search", 20)}
            <label for="service-search" class="sr-only">Buscar</label>
            <input id="service-search" class="input" type="search" placeholder="Buscar ${kind.label.toLowerCase()}" value="${escapeHtml(state.search)}" autocomplete="off">
        </div>
        <div class="option-list" id="service-list">${serviceListHtml()}</div>`;
}

function stepPayment() {
    const p = state.payment;
    const price = formatMoney(state.service.price);
    const ready = p.type === "PRIVATE" || (p.type === "INSURANCE" && p.insuranceId && p.cardNumber.trim().length >= 3);
    return `${progress()}
        <h1 class="step-title">Como vai ser o atendimento?</h1>
        <p class="step-subtitle">${escapeHtml(state.service.name)}</p>
        <div class="option-list">
            <button type="button" class="option ${p.type === "PRIVATE" ? "option--selected" : ""}" data-payment="PRIVATE">
                <span class="option__icon">${icon("user", 22)}</span>
                <span class="option__text"><strong>Particular</strong><small>${price ? `Valor: ${price}` : "Valor informado pela recepção"}</small></span>
            </button>
            <button type="button" class="option ${p.type === "INSURANCE" ? "option--selected" : ""}" data-payment="INSURANCE" ${insurances.length ? "" : "disabled"}>
                <span class="option__icon">${icon("shield", 22)}</span>
                <span class="option__text"><strong>Convênio</strong><small>${insurances.length ? "Plano de saúde aceito pela clínica" : "Nenhum convênio cadastrado"}</small></span>
            </button>
        </div>
        ${p.type === "INSURANCE" ? `<div class="card mt-16">
            <div class="field"><label for="insurance">Convênio</label>
                <select id="insurance" class="input">
                    <option value="">Selecione</option>
                    ${insurances.map((i) => `<option value="${escapeHtml(i.id)}" ${p.insuranceId === i.id ? "selected" : ""}>${escapeHtml(i.name)}</option>`).join("")}
                </select></div>
            <div class="field"><label for="card-number">Número da carteirinha</label>
                <input id="card-number" class="input" inputmode="numeric" autocomplete="off" value="${escapeHtml(p.cardNumber)}"></div>
            <p class="hint">A clínica confere a cobertura do convênio antes de marcar o horário.</p>
        </div>` : ""}
        <button type="button" class="btn btn-primary mt-16" data-next ${ready ? "" : "disabled"} id="payment-next">Continuar</button>`;
}

function stepPreference() {
    const min = new Date();
    min.setDate(min.getDate() + 1);
    return `${progress()}
        <h1 class="step-title">Quando prefere ser atendido?</h1>
        <p class="step-subtitle">A recepção tenta o horário mais próximo da sua preferência.</p>
        <div class="field"><label for="preferred-date">Data de preferência <span class="hint">- opcional</span></label>
            <input id="preferred-date" type="date" class="input" min="${toDateInputValue(min)}" value="${escapeHtml(state.preferredDate)}">
            <p class="hint">Deixe em branco para a primeira data disponível.</p></div>
        <fieldset class="radio-group"><legend>Período</legend>
            ${Object.entries(PERIODS).map(([k, v]) => `<label class="radio"><input type="radio" name="period" value="${k}" ${state.preferredPeriod === k ? "checked" : ""}><span>${v}</span></label>`).join("")}
        </fieldset>
        <button type="button" class="btn btn-primary" data-next>Continuar</button>`;
}

function requiredDocs() {
    return state.service.requiresMedicalRequest ? ["MEDICAL_REQUEST"] : [];
}

function stepDocuments() {
    const required = requiredDocs();
    const missing = required.filter((d) => !state.files[d]);
    return `${progress()}
        <h1 class="step-title">Documentos</h1>
        <p class="step-subtitle">${required.length ? "Fotografe o pedido médico." : "Se tiver, envie o pedido médico ou outro documento."}</p>
        ${fileSlotHtml({ key: "MEDICAL_REQUEST", label: DOCUMENT_TYPES.MEDICAL_REQUEST, required: required.includes("MEDICAL_REQUEST"), hint: "Foto nítida, com carimbo e assinatura do médico.", file: state.files.MEDICAL_REQUEST })}
        ${state.payment.type === "INSURANCE" ? fileSlotHtml({ key: "INSURANCE_CARD", label: DOCUMENT_TYPES.INSURANCE_CARD, hint: "Frente da carteirinha.", file: state.files.INSURANCE_CARD }) : ""}
        <div class="field">
            <label for="notes">Observações <span class="hint">- opcional</span></label>
            <textarea id="notes" class="input" rows="3" maxlength="500" placeholder="Ex.: preciso de acessibilidade, prefiro médica...">${escapeHtml(state.notes)}</textarea>
        </div>
        ${missing.length ? `<p class="hint">Falta enviar: ${missing.map((d) => escapeHtml(DOCUMENT_TYPES[d])).join(", ")}.</p>` : ""}
        <button type="button" class="btn btn-primary" data-next ${missing.length ? "disabled" : ""}>Revisar pedido</button>`;
}

function selectedFiles() {
    return ["MEDICAL_REQUEST", "INSURANCE_CARD"].filter((k) => state.files[k] && (k !== "INSURANCE_CARD" || state.payment.type === "INSURANCE"))
        .map((k) => ({ type: k, file: state.files[k] }));
}

function stepReview() {
    const s = state.service;
    const p = state.payment;
    return `${progress()}
        <h1 class="step-title">Revise seu pedido</h1>
        <p class="step-subtitle">Confira antes de enviar.</p>
        <section class="card">
            <dl class="review-list">
                <div><dt>${SERVICE_KINDS[s.kind].label}</dt><dd>${escapeHtml(s.name)}</dd></div>
                <div><dt>Pagamento</dt><dd>${p.type === "INSURANCE" ? `${escapeHtml(p.insuranceName)} · carteirinha ${escapeHtml(p.cardNumber)}` : `${PAYMENT_TYPES.PRIVATE}${formatMoney(s.price) ? ` · ${formatMoney(s.price)}` : ""}`}</dd></div>
                <div><dt>Preferência</dt><dd>${state.preferredDate ? formatBirthDate(state.preferredDate) : "Primeira data disponível"} · ${PERIODS[state.preferredPeriod]}</dd></div>
                <div><dt>Paciente</dt><dd>${escapeHtml(patient?.name || profile.name)}<br><small>CPF ${maskCPF(patient?.cpf)}</small></dd></div>
                <div><dt>Documentos</dt><dd>${selectedFiles().length ? selectedFiles().map((f) => `${icon("check", 16)} ${escapeHtml(DOCUMENT_TYPES[f.type])}`).join("<br>") : "Nenhum"}</dd></div>
                ${state.notes ? `<div><dt>Observações</dt><dd>${escapeHtml(state.notes)}</dd></div>` : ""}
            </dl>
        </section>
        ${s.preparation ? `<section class="alert alert--info">${icon("info", 20)}<div><strong>Preparo</strong><p>${escapeHtml(s.preparation)}</p></div></section>` : ""}
        <label class="checkbox">
            <input type="checkbox" id="accept" ${state.accepted ? "checked" : ""}>
            <span>Confirmo que as informações estão corretas e autorizo a clínica a usar meus dados para o atendimento.</span>
        </label>
        <div id="upload-progress" class="upload-progress" hidden>
            <p class="hint" id="upload-label">Enviando...</p>
            <div class="progress"><div class="progress__bar" id="upload-bar"></div></div>
        </div>
        <button type="button" class="btn btn-primary" id="submit-request" ${state.accepted ? "" : "disabled"}>${icon("send", 20)} Enviar pedido</button>`;
}

function stepDone() {
    return `<div class="protocol-box">
        <div class="success-icon">${icon("check", 40)}</div>
        <h1 class="step-title">Pedido enviado!</h1>
        <p class="step-subtitle">Guarde o número do protocolo.</p>
        <div class="card protocol-card">
            <p class="hint">Protocolo</p>
            <p class="protocol-number">${escapeHtml(state.done.protocol)}</p>
            <p class="hint">${escapeHtml(state.service.name)}</p>
        </div>
        <p>A recepção vai escolher o horário e você receberá um aviso para confirmar sua presença.</p>
        <a class="btn btn-primary" href="${pageUrl("app/agendamento.html", { id: state.done.id })}">Acompanhar pedido</a>
        <a class="btn btn-secondary" href="${pageUrl("app/home.html")}">Voltar ao início</a>
    </div>`;
}

const RENDERERS = [stepKind, stepService, stepPayment, stepPreference, stepDocuments, stepReview];

function render() {
    if (state.done) {
        main.innerHTML = stepDone();
        return;
    }
    if (state.step >= 1 && !state.kind) state.step = 0;
    if (state.step >= 2 && !state.service) state.step = 1;
    if (state.step >= 3 && !state.payment.type) state.step = 2;
    main.innerHTML = RENDERERS[state.step]();
}

/* ---------- Eventos ---------- */

function refreshPaymentButton() {
    const p = state.payment;
    const ready = p.type === "PRIVATE" || (p.type === "INSURANCE" && p.insuranceId && p.cardNumber.trim().length >= 3);
    const button = document.getElementById("payment-next");
    if (button) button.disabled = !ready;
}

main.addEventListener("click", (event) => {
    const kindButton = event.target.closest("[data-kind]");
    if (kindButton) {
        if (state.kind !== kindButton.dataset.kind) {
            state.service = null;
            state.search = "";
        }
        state.kind = kindButton.dataset.kind;
        goTo(1);
        return;
    }
    const serviceButton = event.target.closest("[data-service]");
    if (serviceButton) {
        state.service = services.find((s) => s.id === serviceButton.dataset.service) || null;
        goTo(2);
        return;
    }
    const paymentButton = event.target.closest("[data-payment]");
    if (paymentButton) {
        state.payment.type = paymentButton.dataset.payment;
        render();
        return;
    }
    if (event.target.closest("[data-next]")) {
        goTo(state.step + 1);
        return;
    }
    const submitButton = event.target.closest("#submit-request");
    if (submitButton) submit(submitButton);
});

main.addEventListener("input", debounce((event) => {
    if (event.target.id === "service-search") {
        state.search = event.target.value;
        document.getElementById("service-list").innerHTML = serviceListHtml();
    }
}, 150));

main.addEventListener("input", (event) => {
    if (event.target.id === "notes") state.notes = event.target.value;
    if (event.target.id === "card-number") {
        state.payment.cardNumber = event.target.value;
        refreshPaymentButton();
    }
});

main.addEventListener("change", (event) => {
    const { target } = event;
    if (target.id === "insurance") {
        const insurance = insurances.find((i) => i.id === target.value);
        state.payment.insuranceId = insurance?.id || "";
        state.payment.insuranceName = insurance?.name || "";
        refreshPaymentButton();
    }
    if (target.id === "preferred-date") state.preferredDate = target.value;
    if (target.name === "period") state.preferredPeriod = target.value;
    if (target.id === "accept") {
        state.accepted = target.checked;
        document.getElementById("submit-request").disabled = !state.accepted;
    }
});

async function submit(button) {
    if (state.sending) return;
    state.sending = true;
    setButtonLoading(button, true, "Enviando...");
    const progressBox = document.getElementById("upload-progress");
    const bar = document.getElementById("upload-bar");
    const label = document.getElementById("upload-label");
    const files = selectedFiles();
    if (files.length) progressBox.hidden = false;

    try {
        const result = await createAppointmentRequest({
            user,
            profile,
            patient,
            service: state.service,
            payment: state.payment,
            preferredDate: state.preferredDate,
            preferredPeriod: state.preferredPeriod,
            notes: state.notes,
            files
        }, (percent) => {
            bar.style.width = `${percent}%`;
            label.textContent = `Enviando documentos... ${percent}%`;
        });
        state.done = result;
        state.sending = false;
        history.replaceState({ step: "done" }, "");
        render();
        window.scrollTo(0, 0);
    } catch (error) {
        console.error("Falha ao enviar pedido:", error);
        state.sending = false;
        progressBox.hidden = true;
        setButtonLoading(button, false);
        toast(friendlyError(error, "Não foi possível enviar. Verifique sua conexão e tente novamente."), "error", 7000);
    }
}

/* ---------- Carregamento ---------- */

async function load() {
    main.innerHTML = loadingState("Carregando...");
    try {
        [services, insurances, patient] = await Promise.all([
            listServices(profile.clinicId, { activeOnly: true }),
            listInsurances(profile.clinicId, { activeOnly: true }),
            getPatient(profile.patientId)
        ]);
        render();
    } catch (error) {
        console.error(error);
        renderError(main, load, { title: "Não conseguimos carregar as opções de atendimento." });
    }
}

load();
