import { NextResponse, type NextRequest } from "next/server";
import {
  ACADEMIC_LEVEL_LABELS,
  getAcademicGradeLabel,
} from "@/lib/academic";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import type { DesgloseAlumnos } from "@/types/database";

export const dynamic = "force-dynamic";

function csvCell(value: string | number) {
  return `"${String(value).replace(/\r?\n/g, " ").replace(/"/g, '""')}"`;
}

function csvRow(...values: Array<string | number>) {
  return values.map(csvCell).join(",");
}

function buildCsv(report: DesgloseAlumnos) {
  const detailRows = report.niveles.flatMap((level) => [
    ...level.grados.map((grade) =>
      csvRow(
        ACADEMIC_LEVEL_LABELS[level.nivel],
        getAcademicGradeLabel(level.nivel, grade.grado),
        grade.total,
        grade.hombres,
        grade.mujeres,
        grade.activos,
        grade.pausas,
        grade.bajas,
      ),
    ),
    csvRow(
      ACADEMIC_LEVEL_LABELS[level.nivel],
      "TOTAL DEL NIVEL",
      level.total,
      level.hombres,
      level.mujeres,
      level.activos,
      level.pausas,
      level.bajas,
    ),
  ]);

  const lines = [
    csvRow("DESGLOSE DEL PADRÓN DE ALUMNOS"),
    csvRow("Ciclo escolar", report.ciclo_escolar),
    csvRow("Generado", report.generado_en),
    "",
    csvRow(
      "Nivel",
      "Grado / semestre",
      "Total",
      "Hombres",
      "Mujeres",
      "Activos",
      "En pausa",
      "Bajas",
    ),
    ...detailRows,
    csvRow(
      "TODOS LOS NIVELES",
      "TOTAL GENERAL",
      report.total_general,
      report.total_hombres,
      report.total_mujeres,
      report.total_activos,
      report.total_pausas,
      report.total_bajas,
    ),
  ];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export async function GET(request: NextRequest) {
  const cycle = request.nextUrl.searchParams.get("cycle")?.trim() ?? "";
  if (!/^\d{4}-\d{4}$/.test(cycle)) {
    return NextResponse.json(
      { error: "Selecciona un ciclo escolar válido." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  const [startYear, endYear] = cycle.split("-").map(Number);
  if (endYear !== startYear + 1) {
    return NextResponse.json(
      { error: "El ciclo escolar debe abarcar años consecutivos." },
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
      { error: "No tienes permiso para exportar el padrón escolar." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  const { data, error } = await supabase.rpc("obtener_desglose_alumnos", {
    p_ciclo_escolar: cycle,
  });
  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  return new NextResponse(buildCsv(data), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="desglose-alumnos-${cycle}-${today}.csv"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
