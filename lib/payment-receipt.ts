import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import { readFile } from "node:fs/promises";
import path from "node:path";

export type PaymentReceiptData = {
  paymentId: string;
  folio: string;
  paymentDate: string;
  studentName: string;
  curp: string;
  level: string;
  grade: string;
  group: string;
  concept: string;
  period: string;
  academicCycle: string;
  paymentMethod: string;
  invoiced: boolean;
  amount: number;
};

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const LEFT = 46;
const RIGHT = PAGE_WIDTH - 46;
const NAVY = rgb(10 / 255, 17 / 255, 66 / 255);
const RED = rgb(122 / 255, 0, 0);
const SLATE = rgb(0.32, 0.39, 0.49);
const BORDER = rgb(0.86, 0.89, 0.93);

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawLabelValue(
  page: PDFPage,
  regular: PDFFont,
  bold: PDFFont,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
) {
  page.drawText(label.toUpperCase(), { x, y, size: 8, font: bold, color: SLATE });
  const lines = wrapText(value || "No especificado", regular, 10.5, width);
  lines.slice(0, 2).forEach((line, index) => {
    page.drawText(line, { x, y: y - 17 - index * 13, size: 10.5, font: regular, color: NAVY });
  });
}

function formatPaymentDate(value: string) {
  const date = new Date(value);
  const dateText = new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "America/Mexico_City",
  }).format(date);
  const timeText = new Intl.DateTimeFormat("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZone: "America/Mexico_City",
  }).format(date);
  return `${dateText}, ${timeText}`;
}

export async function buildPaymentReceiptPdf(data: PaymentReceiptData) {
  const document = await PDFDocument.create();
  document.setTitle(`Comprobante de pago ${data.folio}`);
  document.setAuthor(process.env.SCHOOL_NAME ?? "Sociedad de Educación Integral San Nicolás A.C.");
  document.setSubject("Comprobante de pago escolar");
  document.setCreator("Sistema de Gestión de Pagos");
  document.setProducer("Sistema de Gestión de Pagos");

  const page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const logoBytes = await readFile(path.join(process.cwd(), "public", "logo-cejv-comprobante.png"));
  const logo = await document.embedPng(logoBytes);
  const schoolName = process.env.SCHOOL_NAME?.trim() || "SOCIEDAD DE EDUCACIÓN INTEGRAL SAN NICOLÁS A.C.";

  const logoSize = logo.scaleToFit(70, 55);
  page.drawImage(logo, { x: LEFT, y: PAGE_HEIGHT - 92, width: logoSize.width, height: logoSize.height });
  page.drawText(schoolName.toUpperCase(), { x: LEFT + 82, y: PAGE_HEIGHT - 43, size: 9, font: bold, color: RED });
  page.drawText("COMPROBANTE DE PAGO", { x: LEFT + 82, y: PAGE_HEIGHT - 69, size: 18, font: bold, color: NAVY });
  page.drawText("Documento emitido por el sistema de gestión escolar", { x: LEFT + 82, y: PAGE_HEIGHT - 87, size: 8.5, font: regular, color: SLATE });

  const folioWidth = bold.widthOfTextAtSize(data.folio, 11);
  page.drawText("FOLIO", { x: RIGHT - folioWidth, y: PAGE_HEIGHT - 43, size: 8, font: bold, color: RED });
  page.drawText(data.folio, { x: RIGHT - folioWidth, y: PAGE_HEIGHT - 61, size: 11, font: bold, color: NAVY });
  const dateText = formatPaymentDate(data.paymentDate);
  const dateWidth = regular.widthOfTextAtSize(dateText, 8.5);
  page.drawText(dateText, { x: RIGHT - dateWidth, y: PAGE_HEIGHT - 80, size: 8.5, font: regular, color: SLATE });
  page.drawLine({ start: { x: LEFT, y: PAGE_HEIGHT - 108 }, end: { x: RIGHT, y: PAGE_HEIGHT - 108 }, thickness: 2, color: NAVY });
  page.drawLine({ start: { x: LEFT, y: PAGE_HEIGHT - 112 }, end: { x: RIGHT, y: PAGE_HEIGHT - 112 }, thickness: 0.8, color: RED });

  page.drawText("DATOS DEL ALUMNO", { x: LEFT, y: 634, size: 10, font: bold, color: RED });
  page.drawRectangle({ x: LEFT, y: 510, width: RIGHT - LEFT, height: 105, borderColor: BORDER, borderWidth: 1 });
  drawLabelValue(page, regular, bold, "Alumno", data.studentName, LEFT + 18, 588, 300);
  drawLabelValue(page, regular, bold, "CURP / Matrícula", data.curp, LEFT + 335, 588, 165);
  drawLabelValue(page, regular, bold, "Nivel", data.level, LEFT + 18, 540, 135);
  drawLabelValue(page, regular, bold, "Grado / semestre", data.grade, LEFT + 180, 540, 145);
  drawLabelValue(page, regular, bold, "Grupo", data.group, LEFT + 370, 540, 115);

  page.drawText("DETALLE DEL PAGO", { x: LEFT, y: 476, size: 10, font: bold, color: RED });
  page.drawRectangle({ x: LEFT, y: 330, width: RIGHT - LEFT, height: 127, borderColor: BORDER, borderWidth: 1 });
  drawLabelValue(page, regular, bold, "Concepto", data.concept, LEFT + 18, 427, 225);
  drawLabelValue(page, regular, bold, "Periodo", data.period, LEFT + 275, 427, 210);
  drawLabelValue(page, regular, bold, "Ciclo escolar", data.academicCycle, LEFT + 18, 378, 135);
  drawLabelValue(page, regular, bold, "Método de pago", data.paymentMethod, LEFT + 180, 378, 145);
  drawLabelValue(page, regular, bold, "Factura", data.invoiced ? "Sí" : "No", LEFT + 370, 378, 115);

  page.drawRectangle({ x: LEFT, y: 235, width: RIGHT - LEFT, height: 70, borderColor: NAVY, borderWidth: 1.2 });
  page.drawLine({ start: { x: LEFT, y: 235 }, end: { x: LEFT, y: 305 }, thickness: 4, color: RED });
  page.drawText("TOTAL RECIBIDO", { x: LEFT + 18, y: 277, size: 9, font: bold, color: RED });
  page.drawText("Monto registrado en pesos mexicanos", { x: LEFT + 18, y: 256, size: 9, font: regular, color: SLATE });
  const amount = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(data.amount);
  const amountWidth = bold.widthOfTextAtSize(amount, 24);
  page.drawText(amount, { x: RIGHT - 18 - amountWidth, y: 258, size: 24, font: bold, color: NAVY });

  page.drawRectangle({ x: LEFT, y: 148, width: RIGHT - LEFT, height: 60, borderColor: BORDER, borderWidth: 1 });
  page.drawText("REFERENCIA DE VALIDACIÓN", { x: LEFT + 16, y: 184, size: 8, font: bold, color: SLATE });
  page.drawText(`ID de transacción: ${data.paymentId}`, { x: LEFT + 16, y: 164, size: 8.5, font: regular, color: NAVY });

  const notice = "Este comprobante acredita el registro del pago en el sistema escolar. Consérvalo para cualquier duda o aclaración. No sustituye al CFDI cuando se requiera factura.";
  wrapText(notice, regular, 8.5, RIGHT - LEFT).forEach((line, index) => {
    page.drawText(line, { x: LEFT, y: 111 - index * 12, size: 8.5, font: regular, color: SLATE });
  });

  page.drawLine({ start: { x: LEFT, y: 62 }, end: { x: RIGHT, y: 62 }, thickness: 1, color: NAVY });
  page.drawText("Generado electrónicamente. Para verificarlo, consulta el folio en el historial de pagos.", { x: LEFT, y: 43, size: 7.5, font: regular, color: SLATE });
  page.drawText("Página 1 de 1", { x: RIGHT - 55, y: 43, size: 7.5, font: regular, color: SLATE });

  return document.save();
}
