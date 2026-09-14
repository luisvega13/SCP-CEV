import { NextResponse, type NextRequest } from "next/server";
import {
  ACADEMIC_LEVEL_LABELS,
  getAcademicGradeLabel,
} from "@/lib/academic";
import { getPaymentMethodLabel } from "@/lib/payments";
import { buildPaymentReceiptPdf } from "@/lib/payment-receipt";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import type { Alumno, Pago } from "@/types/database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ReceiptPayment = Pick<
  Pago,
  | "id"
  | "folio_comprobante"
  | "monto"
  | "tipo_pago"
  | "metodo_pago"
  | "facturado"
  | "fecha_pago"
  | "mes"
  | "anio"
  | "ciclo_escolar"
> & {
  alumnos: Pick<
    Alumno,
    | "nombre"
    | "apellido_paterno"
    | "apellido_materno"
    | "matricula"
    | "nivel"
    | "grado"
    | "grupo"
  >;
};

function fullName(student: ReceiptPayment["alumnos"]) {
  return [student.nombre, student.apellido_paterno, student.apellido_materno]
    .filter(Boolean)
    .join(" ");
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json(
      { error: "El identificador del pago no es válido." },
      { status: 400 },
    );
  }

  const supabase = await getSupabaseServerClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json(
      { error: "La sesión expiró. Inicia sesión nuevamente." },
      { status: 401 },
    );
  }

  const { data, error } = await supabase
    .from("pagos")
    .select("id, folio_comprobante, monto, tipo_pago, metodo_pago, facturado, fecha_pago, mes, anio, ciclo_escolar, alumnos!inner(nombre, apellido_paterno, apellido_materno, matricula, nivel, grado, grupo)")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "No se encontró el pago o no tienes permiso para consultar su comprobante." },
      { status: error?.code === "PGRST116" ? 404 : 400 },
    );
  }

  const payment = data as unknown as ReceiptPayment;
  const pdf = await buildPaymentReceiptPdf({
    paymentId: payment.id,
    folio: payment.folio_comprobante,
    paymentDate: payment.fecha_pago,
    studentName: fullName(payment.alumnos),
    curp: payment.alumnos.matricula,
    level: ACADEMIC_LEVEL_LABELS[payment.alumnos.nivel],
    grade: getAcademicGradeLabel(payment.alumnos.nivel, payment.alumnos.grado),
    group: payment.alumnos.grupo,
    concept: payment.tipo_pago === "inscripcion" ? "Inscripción" : "Mensualidad",
    period: `${payment.mes.charAt(0).toUpperCase()}${payment.mes.slice(1)} ${payment.anio}`,
    academicCycle: payment.ciclo_escolar,
    paymentMethod: getPaymentMethodLabel(payment.metodo_pago),
    invoiced: payment.facturado,
    amount: Number(payment.monto),
  });

  return new NextResponse(Buffer.from(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="comprobante-${payment.folio_comprobante}.pdf"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
