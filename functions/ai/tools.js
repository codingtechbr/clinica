// Busca SOMENTE os dados permitidos do paciente autenticado para o contexto da IA.
const { HttpsError } = require("firebase-functions/v2/https");

function toDate(value) {
    return value && typeof value.toDate === "function" ? value.toDate() : null;
}

async function buildPatientContext(db, uid) {
    const userSnapshot = await db.doc(`users/${uid}`).get();
    const user = userSnapshot.data();
    if (!user || user.role !== "PATIENT" || user.active === false) {
        throw new HttpsError("permission-denied", "A assistente está disponível apenas para pacientes.");
    }
    const clinicId = user.clinicId;
    const patientId = user.patientId;

    const [patientSnapshot, appointmentsSnapshot, knowledgeSnapshot, clinicSnapshot, servicesSnapshot] = await Promise.all([
        db.doc(`patients/${patientId}`).get(),
        db.collection("appointments").where("patientUid", "==", uid).get(),
        db.collection("knowledgeBase").where("clinicId", "==", clinicId).where("active", "==", true).limit(30).get(),
        db.doc(`clinics/${clinicId}`).get(),
        db.collection("services").where("clinicId", "==", clinicId).where("active", "==", true).limit(80).get()
    ]);

    const appointments = appointmentsSnapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (toDate(b.createdAt)?.getTime() ?? 0) - (toDate(a.createdAt)?.getTime() ?? 0))
        .slice(0, 20);

    return {
        clinicId,
        patientId,
        patientName: patientSnapshot.get("name") || user.name || "",
        clinic: clinicSnapshot.exists ? clinicSnapshot.data() : null,
        appointments,
        services: servicesSnapshot.docs.map((d) => d.data()),
        knowledge: knowledgeSnapshot.docs.map((d) => ({ title: d.get("title"), content: d.get("content") }))
    };
}

module.exports = { buildPatientContext, toDate };
