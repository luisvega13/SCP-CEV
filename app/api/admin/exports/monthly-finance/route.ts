import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import type { ResumenFinancieroMensual } from "@/types/database";

export const dynamic = "force-dynamic";

function csvCell(value: string | number) {
  return `"${String(value).replace(/\r?\n/g, " ").replace(/"/g, '""')}"`;
}

function csvRow(...values: Array<string | number>) {
  return values.map(csvCell).join(",");
}

function buildCsv(report: ResumenFinancieroMensual) {
  const lines = [
    csvRow("RESUMEN FINANCIERO MENSUAL", `Ciclo ${report.ciclo_escolar}`),
    csvRow("Generado", report.generado_en),
    csvRow("Criterio", "Proyección, pago aplicado y adeudo corresponden al mismo periodo del cargo."),
    "",
    csvRow(
      "Mes del ciclo",
      "Año",
      "Proyección mensual (MXN)",
      "Pagado aplicado al periodo (MXN)",
      "Adeudo pendiente del mes (MXN)",
    ),
    ...report.meses.map((month) =>
      csvRow(
        month.etiqueta,
        month.anio,
        Number(month.proyectado).toFixed(2),
        Number(month.pagado).toFixed(2),
        Number(month.adeudo).toFixed(2),
      ),
    ),
    csvRow(
      "TOTAL DEL CICLO",
      "",
      Number(report.total_proyectado).toFixed(2),
      Number(report.total_pagado).toFixed(2),
      Number(report.total_adeudo).toFixed(2),
    ),
  ];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export async function GET(request: NextRequest) {
  const cycle = request.nextUrl.searchParams.get("cycle") ?? "";
  const match = /^(\d{4})-(\d{4})$/.exec(cycle);
  if (!match || Number(match[2]) !== Number(match[1]) + 1) {
    return NextResponse.json(
      { error: "Selecciona un ciclo escolar válido." },
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
      { error: "No tienes permiso para exportar información financiera." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  const { data, error } = await supabase.rpc(
    "obtener_resumen_financiero_mensual",
    { p_ciclo_escolar: cycle },
  );
  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  return new NextResponse(buildCsv(data), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="resumen-financiero-${cycle}.csv"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
