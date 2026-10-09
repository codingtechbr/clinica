// Novo pedido do paciente: aviso de recebimento + auditoria.
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { createAudit } = require("../audit/create-audit");

exports.onAppointmentCreated = onDocumentCreated("appointments/{appointmentId}", async (event) => {
    const a = event.data?.data();
    if (!a) return;
    const appointmentId = event.params.appointmentId;

    await getFirestore().collection("notifications").add({
        clinicId: a.clinicId,
        userId: a.patientUid,
        patientId: a.patientId,
        appointmentId,
        type: "APPOINTMENT_REQUESTED",
        title: "Pedido recebido",
        message: `Recebemos seu pedido de ${a.serviceName} (protocolo ${a.protocol}). A recepção vai marcar o horário e você será avisado.`,
        read: false,
        createdAt: FieldValue.serverTimestamp()
    });

    await createAudit({
        clinicId: a.clinicId,
        userId: a.createdBy || "system",
        action: "APPOINTMENT_REQUESTED",
        entity: "APPOINTMENT",
        entityId: appointmentId,
        patientId: a.patientId,
        newData: { serviceId: a.serviceId, protocol: a.protocol, payment: a.payment?.type || null }
    });
});
