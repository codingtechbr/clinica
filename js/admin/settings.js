// Configurações: dados da clínica, dados iniciais e base de conhecimento da IA.
import { initAdminPage } from "./shell.js";
import { getClinic, saveClinic, listArticles, saveArticle, seedDefaultArticles } from "../services/settings-service.js";
import { seedDefaultServices, seedDefaultInsurances } from "../services/catalog-service.js";
import { icon, toneBadge, renderError, loadingState, openModal, toast, setButtonLoading } from "../ui.js";
import { escapeHtml, ROLE_GROUPS, friendlyError, userError } from "../utils.js";

const { actor, content } = await initAdminPage("settings", "Configurações", ROLE_GROUPS.ADMIN);

const CATEGORIES = { APPOINTMENTS: "Agendamentos", DOCUMENTS: "Documentos", RESULTS: "Resultados", GENERAL: "Geral" };
let clinic = null;
let articles = [];

function render() {
    const c = clinic || {};
    content.innerHTML = `
        <section class="panel">
            <h2 class="panel__title">Dados da clínica</h2>
            <p class="hint mb-16">Estas informações também são usadas pela assistente de IA para orientar os pacientes.</p>
            <form id="clinic-form" class="form-grid">
                <div class="field"><label for="c-name">Nome da clínica</label><input id="c-name" name="clinicName" class="input" required value="${escapeHtml(c.name || "Clínica Santa Casa")}"></div>
                <div class="field"><label for="c-phone">Telefone</label><input id="c-phone" name="phone" class="input" value="${escapeHtml(c.phone || "")}"></div>
                <div class="field"><label for="c-whatsapp">WhatsApp</label><input id="c-whatsapp" name="whatsapp" class="input" value="${escapeHtml(c.whatsapp || "")}"></div>
                <div class="field"><label for="c-address">Endereço</label><input id="c-address" name="address" class="input" value="${escapeHtml(c.address || "")}"></div>
                <div class="field"><label for="c-hours">Horário de funcionamento</label><input id="c-hours" name="openingHours" class="input" value="${escapeHtml(c.openingHours || "")}" placeholder="Seg a sex, 7h às 18h · Sáb, 7h às 12h"></div>
                <div class="field"><label for="c-pickup">Retirada de resultados</label><input id="c-pickup" name="resultPickup" class="input" value="${escapeHtml(c.resultPickup || "")}" placeholder="Recepção, seg a sex, 8h às 17h"></div>
                <div class="form-actions"><button type="submit" class="btn btn-primary" id="save-clinic">Salvar</button></div>
            </form>
            <p class="hint">ID da clínica nesta instalação: <code>${escapeHtml(actor.clinicId)}</code></p>
        </section>

        <section class="panel">
            <h2 class="panel__title">Dados iniciais</h2>
            <p class="hint">Cria uma lista de exemplo de exames, consultas, convênios e textos de ajuda. Itens com o mesmo nome não são duplicados. Depois ajuste preços e preparos.</p>
            <button type="button" class="btn btn-secondary" id="seed-all">${icon("refresh", 18)} Criar dados iniciais</button>
        </section>

        <section class="panel">
            <div class="panel__header">
                <h2 class="panel__title">Base de conhecimento da assistente</h2>
                <button type="button" class="btn btn-primary btn-sm" id="new-article">${icon("plus", 16)} Novo texto</button>
            </div>
            <p class="hint">A assistente usa somente estes textos (além dos dados do paciente) para responder.</p>
            ${articles.length ? `<div class="table-wrap"><table class="table">
                <thead><tr><th>Título</th><th>Categoria</th><th>Situação</th><th></th></tr></thead>
                <tbody>${articles.map((a) => `<tr>
                    <td><strong>${escapeHtml(a.title)}</strong><br><small class="text-secondary">${escapeHtml(a.content.slice(0, 120))}${a.content.length > 120 ? "..." : ""}</small></td>
                    <td>${escapeHtml(CATEGORIES[a.category] || a.category)}</td>
                    <td>${a.active === false ? toneBadge("Inativo", "neutral") : toneBadge("Ativo", "success")}</td>
                    <td><button type="button" class="btn btn-secondary btn-sm" data-edit="${escapeHtml(a.id)}">${icon("edit", 16)} Editar</button></td>
                </tr>`).join("")}</tbody></table></div>` : '<p class="hint">Nenhum texto ainda.</p>'}
        </section>`;

    document.getElementById("clinic-form").addEventListener("submit", async (event) => {
        event.preventDefault();
        const button = document.getElementById("save-clinic");
        const data = Object.fromEntries(new FormData(event.target));
        try {
            setButtonLoading(button, true, "Salvando...");
            await saveClinic(actor, { ...data, name: data.clinicName });
            clinic = await getClinic(actor.clinicId);
            setButtonLoading(button, false);
            toast("Dados da clínica salvos.", "success");
        } catch (error) {
            console.error(error);
            setButtonLoading(button, false);
            toast(friendlyError(error), "error");
        }
    });
}

function editArticle(article = null) {
    const a = article || { category: "GENERAL", active: true };
    return openModal({
        title: article ? "Editar texto" : "Novo texto",
        confirmLabel: "Salvar",
        wide: true,
        body: `
            <div class="field"><label for="a-title">Título</label><input id="a-title" name="title" class="input" value="${escapeHtml(a.title || "")}"></div>
            <div class="field"><label for="a-category">Categoria</label><select id="a-category" name="category" class="input">
                ${Object.entries(CATEGORIES).map(([k, v]) => `<option value="${k}" ${a.category === k ? "selected" : ""}>${v}</option>`).join("")}</select></div>
            <div class="field"><label for="a-content">Conteúdo</label><textarea id="a-content" name="content" class="input" rows="6">${escapeHtml(a.content || "")}</textarea></div>
            <label class="checkbox"><input type="checkbox" name="active" ${a.active !== false ? "checked" : ""}><span>Ativo</span></label>`,
        onConfirm: async (form) => {
            const fd = new FormData(form);
            const data = Object.fromEntries(fd);
            if (!data.title.trim() || !data.content.trim()) throw userError("Preencha título e conteúdo.");
            await saveArticle(actor, { ...data, active: fd.has("active") }, article?.id || null);
        }
    });
}

content.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button || button.type === "submit") return;
    try {
        if (button.id === "seed-all") {
            setButtonLoading(button, true, "Criando...");
            const [s, i, a] = await Promise.all([seedDefaultServices(actor), seedDefaultInsurances(actor), seedDefaultArticles(actor)]);
            toast(`Criados: ${s} exames/consultas, ${i} convênios e ${a} textos.`, "success", 7000);
            await load();
        } else if (button.id === "new-article" && await editArticle()) {
            toast("Texto salvo.", "success");
            await load();
        } else if (button.dataset.edit && await editArticle(articles.find((x) => x.id === button.dataset.edit))) {
            toast("Texto salvo.", "success");
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
        [clinic, articles] = await Promise.all([getClinic(actor.clinicId), listArticles(actor.clinicId)]);
        render();
    } catch (error) {
        console.error(error);
        renderError(content, load);
    }
}

load();
