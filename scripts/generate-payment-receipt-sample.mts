import { mkdir, writeFile } from "node:fs/promises";
import { buildPaymentReceiptPdf } from "../lib/payment-receipt.ts";

const outputDirectory = new URL("../output/pdf/", import.meta.url);
await mkdir(outputDirectory, { recursive: true });

const pdf = await buildPaymentReceiptPdf({
  paymentId: "c345c53d-7036-4d4d-b8a7-09a18bc89d8f",
  folio: "CEV-20260913-00000125",
  paymentDate: "2026-09-13T11:47:23.000Z",
  studentName: "Sofía Morales Cruz",
  curp: "MOCS230215MPLRRFA7",
  level: "Preescolar",
  grade: "1° grado",
  group: "A",
  concept: "Mensualidad",
  period: "Septiembre 2026",
  academicCycle: "2026-2027",
  paymentMethod: "Transferencia",
  invoiced: true,
  amount: 1950,
});

await writeFile(new URL("comprobante-pago-ejemplo.pdf", outputDirectory), pdf);
