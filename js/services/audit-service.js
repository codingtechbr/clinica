// Registro de auditoria. Sempre gravado no MESMO lote da alteração auditada.
import { db } from "../firebase-config.js";
import { doc, collection, serverTimestamp } from "../lib/firestore.js";

// actor = { uid, name, role, clinicId }
export function addAudit(batch, actor, { action, entity, entityId, patientId = null, previousData = {}, newData = {} }) {
    batch.set(doc(collection(db, "auditLogs")), {
        clinicId: actor.clinicId,
        userId: actor.uid,
        userName: actor.name || "",
        userRole: actor.role || "",
        action,
        entity,
        entityId,
        patientId,
        previousData,
        newData,
        createdAt: serverTimestamp()
    });
}
