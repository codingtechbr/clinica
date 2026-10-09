// Auditoria gravada pelo servidor (Admin SDK ignora as Security Rules).
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

async function createAudit({ clinicId, userId = "system", action, entity, entityId, patientId = null, previousData = {}, newData = {} }) {
    await getFirestore().collection("auditLogs").add({
        clinicId,
        userId,
        userName: userId === "system" ? "Sistema" : "",
        userRole: userId === "system" ? "SYSTEM" : "",
        action,
        entity,
        entityId,
        patientId,
        previousData,
        newData,
        createdAt: FieldValue.serverTimestamp()
    });
}

module.exports = { createAudit };
