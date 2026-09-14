export const DEFAULT_WHATSAPP_REMINDER_TEMPLATE = `Hola {{nombre_tutor}}. Le enviamos un recordatorio del estado de cuenta de {{nombre_alumno}}. El saldo vencido total es de {{monto_total}}, correspondiente a:

{{detalle_adeudo}}

Si ya realizó alguno de estos pagos, por favor ignore este mensaje o comuníquese con administración para una aclaración.`;

export const WHATSAPP_REMINDER_VARIABLES = [
  { token: "{{nombre_tutor}}", label: "Nombre del tutor" },
  { token: "{{nombre_alumno}}", label: "Nombre del alumno" },
  { token: "{{monto_total}}", label: "Monto total" },
  { token: "{{detalle_adeudo}}", label: "Detalle de adeudos" },
] as const;

export type WhatsAppReminderValues = {
  tutorName: string;
  studentName: string;
  totalAmount: string;
  debtDetail: string;
};

export function renderWhatsAppReminderTemplate(
  template: string,
  values: WhatsAppReminderValues,
) {
  const replacements: Record<string, string> = {
    "{{nombre_tutor}}": values.tutorName,
    "{{nombre_alumno}}": values.studentName,
    "{{monto_total}}": values.totalAmount,
    "{{detalle_adeudo}}": values.debtDetail,
  };

  return Object.entries(replacements).reduce(
    (message, [token, value]) => message.replaceAll(token, value),
    template,
  );
}
