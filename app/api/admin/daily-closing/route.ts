import { NextResponse, type NextRequest } from "next/server";
import { getPaymentMethodLabel } from "@/lib/payments";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import type { CorteDiario } from "@/types/database";

export const dynamic = "force-dynamic";

function csvCell(value: string | number) {
  const normalized = String(value).replace(/\r?\n/g, " ");
  return `"${normalized.replace(/"/g, '""')}"`;
}

function row(...values: Array<string | number>) {
  return values.map(csvCell).join(",");
}

function buildCsv(closing: CorteDiario) {
  const lines = [
    row("CORTE DIARIO DE PAGOS", closing.fecha),
    row("Generado", closing.generado_en),
    row("RESUMEN GENERAL"),
    row("Concepto", "Sin factura", "Con factura", "Total"),
    row(
      "Movimientos",
      closing.movimientos_sin_factura,
      closing.movimientos_con_factura,
      closing.total_movimientos,
    ),
    row(
      "Recaudado (MXN)",
      Number(closing.recaudado_sin_factura).toFixed(2),
      Number(closing.recaudado_con_factura).toFixed(2),
      Number(closing.total_recaudado).toFixed(2),
    ),
    "",
    row("RESUMEN POR MÉTODO"),
    row(
      "Método de pago",
      "Movimientos sin factura",
      "Movimientos con factura",
      "Movimientos totales",
      "Recaudado sin factura (MXN)",
      "Recaudado con factura (MXN)",
      "Recaudado total (MXN)",
    ),
    ...closing.por_metodo.map((item) =>
      row(
        getPaymentMethodLabel(item.metodo),
        item.movimientos_sin_factura,
        item.movimientos_con_factura,
        item.movimientos,
        Number(item.recaudado_sin_factura).toFixed(2),
        Number(item.recaudado_con_factura).toFixed(2),
        Number(item.total).toFixed(2),
      ),
    ),
    "",
    row("DETALLE DE MOVIMIENTOS"),
    row(
      "Hora",
      "Alumno",
      "CURP",
      "Tipo de pago",
      "Periodo",
      "Método de pago",
      "Facturado",
      "Monto (MXN)",
      "Folio del pago",
    ),
    ...closing.pagos.map((payment) =>
      row(
        payment.hora_local,
        payment.alumno,
        payment.curp,
        payment.tipo_pago === "inscripcion" ? "Inscripción" : "Mensualidad",
        payment.periodo,
        getPaymentMethodLabel(payment.metodo_pago),
        payment.facturado ? "Sí" : "No",
        Number(payment.monto).toFixed(2),
        payment.folio_comprobante,
      ),
    ),
  ];

  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: "Selecciona una fecha válida." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const supabase = await getSupabaseServerClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json(
      { error: "La sesión expiró. Inicia sesión nuevamente." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (userData.user.app_metadata.role !== "admin") {
    return NextResponse.json(
      { error: "No tienes permiso para generar cortes diarios." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  const { data, error } = await supabase.rpc("obtener_corte_diario", {
    p_fecha: date,
  });
  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  return new NextResponse(buildCsv(data), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="corte-pagos-${date}.csv"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
