// Cadastro de exames e consultas (preço particular, preparo, prazo do resultado).
import { initAdminPage } from "./shell.js";
import { listServices, saveService, seedDefaultServices } from "../services/catalog-service.js";
import { icon, toneBadge, renderError, emptyState, loadingState, openModal, toast, setButtonLoading } from "../ui.js";
import { escapeHtml, SERVICE_KINDS, ROLE_GROUPS, formatMoney, friendlyError, userError } from "../utils.js";

const { actor, content } = await initAdminPage("services", "Exames e consultas", ROLE_GROUPS.CATALOG);

let services = [];

function render() {
    content.innerHTML = `
        <section class="panel">
            <div class="panel__header">
                <p class="hint">O que o paciente pode agendar pelo aplicativo.</p>
                <div class="actions-bar">
                    ${services.length ? "" : '<button type="button" class="btn btn-secondary" id="seed">Criar lista de exemplo</button>'}
                    <button type="button" class="btn btn-primary" id="new">${icon("plus", 18)} Novo</button>
                </div>
            </div>
            ${services.length ? `<div class="table-wrap"><table class="table">
                <thead><tr><th>Nome</th><th>Tipo</th><th>Especialidade</th><th>Particular</th><th>Prazo do resultado</th><th>Situação</th><th></th></tr></thead>
                <tbody>${services.map((s) => `<tr>
                    <td><strong>${escapeHtml(s.name)}</strong>${s.preparation ? `<br><small class="text-secondary">Preparo: ${escapeHtml(s.preparation.slice(0, 70))}${s.preparation.length > 70 ? "..." : ""}</small>` : ""}</td>
                    <td>${escapeHtml(SERVICE_KINDS[s.kind]?.label || s.kind)}</td>
                    <td>${escapeHtml(s.specialty || "—")}</td>
                    <td>${formatMoney(s.price) || "—"}</td>
                    <td>${s.kind === "EXAM" ? `${s.resultDays || 0} dia(s)` : "—"}</td>
                    <td>${s.active === false ? toneBadge("Inativo", "neutral") : toneBadge("Ativo", "success")}</td>
                    <td><button type="button" class="btn btn-secondary btn-sm" data-edit="${escapeHtml(s.id)}">${icon("edit", 16)} Editar</button></td>
                </tr>`).join("")}</tbody></table></div>`
                : emptyState({ title: "Nenhum exame ou consulta cadastrado.", text: "Crie a lista de exemplo e ajuste os preços.", iconName: "activity" })}
        </section>`;
}

function edit(service = null) {
    const s = service || { kind: "CONSULTATION", active: true, durationMinutes: 30, resultDays: 1, requiresMedicalRequest: true };
    return openModal({
        title: service ? "Editar" : "Novo exame ou consulta",
        confirmLabel: "Salvar",
        wide: true,
        body: `
            <div class="field"><label for="s-name">Nome</label><input id="s-name" name="serviceName" class="input" value="${escapeHtml(s.name || "")}"></div>
            <div class="field-row">
                <div class="field"><label for="s-kind">Tipo</label><select id="s-kind" name="kind" class="input">
                    ${Object.entries(SERVICE_KINDS).map(([k, v]) => `<option value="${k}" ${s.kind === k ? "selected" : ""}>${v.label}</option>`).join("")}</select></div>
                <div class="field"><label for="s-specialty">Especialidade / setor</label><input id="s-specialty" name="specialty" class="input" value="${escapeHtml(s.specialty || "")}"></div>
            </div>
            <div class="field-row">
                <div class="field"><label for="s-price">Valor particular (R$)</label><input id="s-price" name="price" type="number" min="0" step="0.01" class="input" value="${escapeHtml(s.price ?? "")}"></div>
                <div class="field"><label for="s-duration">Duração (min)</label><input id="s-duration" name="durationMinutes" type="number" min="5" step="5" class="input" value="${escapeHtml(s.durationMinutes ?? 30)}"></div>
                <div class="field"><label for="s-days">Prazo do resultado (dias)</label><input id="s-days" name="resultDays" type="number" min="0" class="input" value="${escapeHtml(s.resultDays ?? 1)}"></div>
            </div>
            <div class="field"><label for="s-prep">Preparo / orientações ao paciente</label><textarea id="s-prep" name="preparation" class="input" rows="3">${escapeHtml(s.preparation || "")}</textarea></div>
            <label class="checkbox"><input type="checkbox" name="requiresMedicalRequest" ${s.requiresMedicalRequest ? "checked" : ""}><span>Exige foto do pedido médico (somente exames)</span></label>
            <label class="checkbox"><input type="checkbox" name="active" ${s.active !== false ? "checked" : ""}><span>Disponível para agendamento</span></label>`,
        onConfirm: async (form) => {
            const fd = new FormData(form);
            const name = String(fd.get("serviceName") || "").trim();
            if (!name) throw userError("Informe o nome.");
            await saveService(actor, {
                name,
                kind: fd.get("kind"),
                specialty: fd.get("specialty"),
                price: fd.get("price"),
                durationMinutes: fd.get("durationMinutes"),
                resultDays: fd.get("resultDays"),
                preparation: fd.get("preparation"),
                requiresMedicalRequest: fd.has("requiresMedicalRequest"),
                active: fd.has("active")
            }, service?.id || null);
        }
    });
}

content.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    try {
        if (button.id === "new" && await edit()) {
            toast("Salvo.", "success");
            await load();
        } else if (button.dataset.edit && await edit(services.find((s) => s.id === button.dataset.edit))) {
            toast("Salvo.", "success");
            await load();
        } else if (button.id === "seed") {
            setButtonLoading(button, true, "Criando...");
            const count = await seedDefaultServices(actor);
            toast(`${count} itens criados. Ajuste os preços.`, "success");
            await load();
        }
    } catch (error) {
        console.error(error);
        setButtonLoading(button, false);
        toast(friendlyError(error), "error");
    }
});

async function load() {
    content.innerHTML = loadingState();
    try {
        services = await listServices(actor.clinicId);
        render();
    } catch (error) {
        console.error(error);
        renderError(content, load);
    }
}

load();
