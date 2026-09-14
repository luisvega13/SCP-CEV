import { NextResponse, type NextRequest } from "next/server";
import { ACADEMIC_LEVEL_LABELS, getAcademicGradeLabel } from "@/lib/academic";
import { getScholarshipDiscountLabel, getScholarshipScopeLabel } from "@/lib/scholarships";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import type { BecadosPorTipo } from "@/types/database";

export const dynamic = "force-dynamic";

function csvCell(value: string | number) {
  return `"${String(value).replace(/\r?\n/g, " ").replace(/"/g, '""')}"`;
}

function csvRow(...values: Array<string | number>) {
  return values.map(csvCell).join(",");
}

function buildCsv(report: BecadosPorTipo) {
  const sections = report.tipos.flatMap((type) => [
    csvRow("TIPO DE BECA", type.tipo_beca),
    csvRow("Nombre", "CURP", "Nivel", "Grado / semestre", "Grupo", "Estado", "Tipo de descuento", "Descuento", "Aplica a", "Descuento desde"),
    ...type.alumnos.map((student) =>
      csvRow(
        student.nombre,
        student.curp,
        ACADEMIC_LEVEL_LABELS[student.nivel],
        getAcademicGradeLabel(student.nivel, student.grado),
        student.grupo,
        student.estado === "pausa" ? "En pausa" : student.estado,
        student.tipo_descuento === "monto_fijo" ? "Monto fijo" : "Porcentaje",
        getScholarshipDiscountLabel(student),
        getScholarshipScopeLabel(student.alcance),
        student.vigencia_desde,
      ),
    ),
    csvRow("Subtotal", type.total),
    "",
  ]);

  return `\uFEFF${[
    csvRow("ALUMNOS BECADOS POR TIPO"),
    csvRow("Ciclo escolar", report.ciclo_escolar),
    csvRow("Generado", report.generado_en),
    csvRow("Total de alumnos becados", report.total_becados),
    "",
    ...sections,
  ].join("\r\n")}\r\n`;
}

export async function GET(request: NextRequest) {
  const cycle = request.nextUrl.searchParams.get("cycle") ?? "";
  const match = /^(\d{4})-(\d{4})$/.exec(cycle);
  if (!match || Number(match[2]) !== Number(match[1]) + 1) {
    return NextResponse.json({ error: "El ciclo escolar no es válido." }, { status: 400 });
  }

  const supabase = await getSupabaseServerClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: "La sesión expiró. Inicia sesión nuevamente." }, { status: 401 });
  }
  if (userData.user.app_metadata.role !== "admin") {
    return NextResponse.json({ error: "No tienes permiso para exportar alumnos becados." }, { status: 403 });
  }

  const { data, error } = await supabase.rpc("obtener_becados_por_tipo", { p_ciclo_escolar: cycle });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return new NextResponse(buildCsv(data), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="alumnos-becados-${cycle}.csv"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
