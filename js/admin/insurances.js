// Convênios aceitos pela clínica.
import { initAdminPage } from "./shell.js";
import { listInsurances, saveInsurance, seedDefaultInsurances } from "../services/catalog-service.js";
import { icon, toneBadge, renderError, emptyState, loadingState, openModal, toast, setButtonLoading } from "../ui.js";
import { escapeHtml, ROLE_GROUPS, friendlyError, userError } from "../utils.js";

const { actor, content } = await initAdminPage("insurances", "Convênios", ROLE_GROUPS.CATALOG);

let insurances = [];

function render() {
    content.innerHTML = `
        <section class="panel">
            <div class="panel__header">
                <p class="hint">Convênios que o paciente pode escolher ao agendar.</p>
                <div class="actions-bar">
                    ${insurances.length ? "" : '<button type="button" class="btn btn-secondary" id="seed">Criar lista de exemplo</button>'}
                    <button type="button" class="btn btn-primary" id="new">${icon("plus", 18)} Novo convênio</button>
                </div>
            </div>
            ${insurances.length ? `<div class="table-wrap"><table class="table">
                <thead><tr><th>Convênio</th><th>Observações</th><th>Situação</th><th></th></tr></thead>
                <tbody>${insurances.map((i) => `<tr>
                    <td><strong>${escapeHtml(i.name)}</strong></td>
                    <td>${escapeHtml(i.notes || "—")}</td>
                    <td>${i.active === false ? toneBadge("Inativo", "neutral") : toneBadge("Ativo", "success")}</td>
                    <td><button type="button" class="btn btn-secondary btn-sm" data-edit="${escapeHtml(i.id)}">${icon("edit", 16)} Editar</button></td>
                </tr>`).join("")}</tbody></table></div>`
                : emptyState({ title: "Nenhum convênio cadastrado.", text: "Sem convênios, o paciente só verá a opção Particular.", iconName: "shield" })}
        </section>`;
}

function edit(insurance = null) {
    const i = insurance || { active: true };
    return openModal({
        title: insurance ? "Editar convênio" : "Novo convênio",
        confirmLabel: "Salvar",
        body: `
            <div class="field"><label for="i-name">Nome</label><input id="i-name" name="insuranceName" class="input" value="${escapeHtml(i.name || "")}"></div>
            <div class="field"><label for="i-notes">Observações internas</label><textarea id="i-notes" name="notes" class="input" rows="2" placeholder="Ex.: exige autorização prévia para exames de imagem">${escapeHtml(i.notes || "")}</textarea></div>
            <label class="checkbox"><input type="checkbox" name="active" ${i.active !== false ? "checked" : ""}><span>Aceito atualmente</span></label>`,
        onConfirm: async (form) => {
            const fd = new FormData(form);
            const name = String(fd.get("insuranceName") || "").trim();
            if (!name) throw userError("Informe o nome.");
            await saveInsurance(actor, { name, notes: fd.get("notes"), active: fd.has("active") }, insurance?.id || null);
        }
    });
}

content.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    try {
        if (button.id === "new" && await edit()) {
            toast("Convênio salvo.", "success");
            await load();
        } else if (button.dataset.edit && await edit(insurances.find((i) => i.id === button.dataset.edit))) {
            toast("Convênio salvo.", "success");
            await load();
        } else if (button.id === "seed") {
            setButtonLoading(button, true, "Criando...");
            const count = await seedDefaultInsurances(actor);
            toast(`${count} convênios criados.`, "success");
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
        insurances = await listInsurances(actor.clinicId);
        render();
    } catch (error) {
        console.error(error);
        renderError(content, load);
    }
}

load();
