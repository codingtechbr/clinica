// Dados da clínica e base de conhecimento usada pela IA.
import { db } from "../firebase-config.js";
import { doc, collection, getDoc, getDocs, query, where, writeBatch, serverTimestamp } from "../lib/firestore.js";
import { addAudit } from "./audit-service.js";

export async function getClinic(clinicId) {
    const snapshot = await getDoc(doc(db, "clinics", clinicId));
    return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

export async function saveClinic(actor, data) {
    const ref = doc(db, "clinics", actor.clinicId);
    const existing = await getDoc(ref);
    const payload = {
        name: data.name.trim(),
        phone: (data.phone || "").trim(),
        whatsapp: (data.whatsapp || "").trim(),
        address: (data.address || "").trim(),
        openingHours: (data.openingHours || "").trim(),
        resultPickup: (data.resultPickup || "").trim(),
        active: true,
        updatedAt: serverTimestamp()
    };
    if (!existing.exists()) payload.createdAt = serverTimestamp();
    const batch = writeBatch(db);
    batch.set(ref, payload, { merge: true });
    addAudit(batch, actor, { action: "CLINIC_UPDATED", entity: "CLINIC", entityId: actor.clinicId, newData: { name: payload.name } });
    await batch.commit();
}

export const DEFAULT_ARTICLES = [
    {
        title: "Como agendar",
        category: "APPOINTMENTS",
        content: "Pelo aplicativo, toque em Agendar, escolha a consulta ou exame, informe se é particular ou convênio e a data de preferência. A recepção escolhe o horário e você recebe um aviso para confirmar presença."
    },
    {
        title: "Documentos para o atendimento",
        category: "DOCUMENTS",
        content: "Leve documento com foto. Para convênio, leve a carteirinha. Para exames, leve o pedido médico original (o mesmo que foi fotografado no aplicativo)."
    },
    {
        title: "Retirada de resultados",
        category: "RESULTS",
        content: "Quando o resultado estiver pronto, o aplicativo avisa. A retirada é feita na recepção pelo próprio paciente com documento com foto, ou por outra pessoa com autorização assinada e documento do paciente."
    },
    {
        title: "Prazos dos resultados",
        category: "RESULTS",
        content: "O prazo depende do exame e aparece no aplicativo como previsão. Exames de sangue costumam ficar prontos em 1 a 2 dias úteis; exames de imagem em até 3 dias úteis. A previsão pode mudar e a clínica avisa se isso acontecer."
    },
    {
        title: "Cancelar ou remarcar",
        category: "APPOINTMENTS",
        content: "Para cancelar, abra o agendamento no aplicativo e toque em Cancelar. Para remarcar, cancele e faça um novo pedido, ou fale com a recepção. Avise com antecedência para liberar o horário."
    },
    {
        title: "Urgências e emergências",
        category: "GENERAL",
        content: "O aplicativo não atende urgências. Em caso de emergência ligue 192 (SAMU) ou procure o pronto-socorro mais próximo."
    }
];

export async function listArticles(clinicId) {
    const snapshot = await getDocs(query(collection(db, "knowledgeBase"), where("clinicId", "==", clinicId)));
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.title || "").localeCompare(b.title || "", "pt-BR"));
}

export async function saveArticle(actor, data, id = null) {
    const ref = id ? doc(db, "knowledgeBase", id) : doc(collection(db, "knowledgeBase"));
    const payload = {
        clinicId: actor.clinicId,
        title: data.title.trim(),
        category: data.category,
        content: data.content.trim(),
        active: data.active !== false,
        updatedAt: serverTimestamp()
    };
    if (!id) payload.createdAt = serverTimestamp();
    const batch = writeBatch(db);
    batch.set(ref, payload, { merge: true });
    addAudit(batch, actor, { action: id ? "ARTICLE_UPDATED" : "ARTICLE_CREATED", entity: "KNOWLEDGE_BASE", entityId: ref.id, newData: { title: payload.title } });
    await batch.commit();
}

export async function seedDefaultArticles(actor) {
    const existing = await listArticles(actor.clinicId);
    const titles = new Set(existing.map((a) => a.title.toLowerCase()));
    const missing = DEFAULT_ARTICLES.filter((a) => !titles.has(a.title.toLowerCase()));
    if (!missing.length) return 0;
    const batch = writeBatch(db);
    missing.forEach((a) => batch.set(doc(collection(db, "knowledgeBase")), {
        clinicId: actor.clinicId, ...a, active: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    }));
    addAudit(batch, actor, { action: "ARTICLES_SEEDED", entity: "KNOWLEDGE_BASE", entityId: "seed", newData: { count: missing.length } });
    await batch.commit();
    return missing.length;
}

export async function listAuditLogs(clinicId, { patientId = null } = {}) {
    const filters = [where("clinicId", "==", clinicId)];
    if (patientId) filters.push(where("patientId", "==", patientId));
    const snapshot = await getDocs(query(collection(db, "auditLogs"), ...filters));
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}
