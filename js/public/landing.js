// Tela inicial pública. Se já houver sessão, vai direto para o app ou painel.
import { waitForUser, getProfile } from "../auth.js";
import { CLINIC_ID } from "../firebase-config.js";
import { listServices } from "../services/catalog-service.js";
import { getClinic } from "../services/settings-service.js";
import { hydrateIcons, registerServiceWorker } from "../ui.js";
import { go, escapeHtml, STAFF_ROLES, SERVICE_KINDS, formatMoney } from "../utils.js";

hydrateIcons();
registerServiceWorker();

waitForUser().then(async (user) => {
    if (!user) return;
    const profile = await getProfile(user.uid).catch(() => null);
    if (profile?.role === "PATIENT") go("app/home.html");
    else if (STAFF_ROLES.includes(profile?.role)) go("admin/dashboard.html");
});

function lazyDetails(id, loader) {
    const details = document.getElementById(id);
    let loaded = false;
    details?.addEventListener("toggle", async () => {
        if (!details.open || loaded) return;
        loaded = true;
        const body = details.querySelector(".info-body");
        try {
            body.innerHTML = await loader();
        } catch (error) {
            console.warn(error);
            loaded = false;
            body.innerHTML = "<p>Não foi possível carregar agora.</p>";
        }
    });
}

lazyDetails("services-details", async () => {
    const services = await listServices(CLINIC_ID, { activeOnly: true });
    if (!services.length) return "<p>Em breve.</p>";
    return Object.entries(SERVICE_KINDS).map(([kind, info]) => {
        const list = services.filter((s) => s.kind === kind);
        return list.length ? `<p><strong>${info.plural}</strong></p><ul>${list.map((s) => `<li>${escapeHtml(s.name)}${formatMoney(s.price) ? ` <small>· particular ${formatMoney(s.price)}</small>` : ""}</li>`).join("")}</ul>` : "";
    }).join("");
});

lazyDetails("contact-details", async () => {
    const clinic = await getClinic(CLINIC_ID);
    if (!clinic) return "<p>Informações de contato em breve.</p>";
    return `<ul>
        ${clinic.address ? `<li><strong>Endereço:</strong> ${escapeHtml(clinic.address)}</li>` : ""}
        ${clinic.phone ? `<li><strong>Telefone:</strong> ${escapeHtml(clinic.phone)}</li>` : ""}
        ${clinic.whatsapp ? `<li><strong>WhatsApp:</strong> ${escapeHtml(clinic.whatsapp)}</li>` : ""}
        ${clinic.openingHours ? `<li><strong>Funcionamento:</strong> ${escapeHtml(clinic.openingHours)}</li>` : ""}
    </ul>`;
});
