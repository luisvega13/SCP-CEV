import { NextResponse, type NextRequest } from "next/server";
import {
  ACADEMIC_LEVEL_LABELS,
  getAcademicGradeLabel,
} from "@/lib/academic";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import type {
  ConsultaBajasAlumnos,
  ConsultaHistorialBajas,
  HistorialEstadoAlumno,
  NivelEscolar,
} from "@/types/database";

export const dynamic = "force-dynamic";

const VALID_LEVELS = new Set<NivelEscolar>([
  "preescolar",
  "primaria",
  "secundaria",
  "bachillerato",
]);

function csvCell(value: string | number) {
  const normalized = String(value).replace(/\r?\n/g, " ");
  const spreadsheetSafe = /^[=+\-@]/.test(normalized)
    ? `'${normalized}`
    : normalized;
  return `"${spreadsheetSafe.replace(/"/g, '""')}"`;
}

function csvRow(...values: Array<string | number>) {
  return values.map(csvCell).join(",");
}

function formatDate(value: string | null) {
  if (!value) return "Fecha histórica no disponible";
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Mexico_City",
  }).format(new Date(value));
}

type StudentSnapshot = Pick<
  HistorialEstadoAlumno,
  "nombre" | "apellido_paterno" | "apellido_materno"
>;

function getFullName(row: StudentSnapshot) {
  return [row.nombre, row.apellido_paterno, row.apellido_materno].filter(Boolean).join(" ");
}

function statusLabel(status: HistorialEstadoAlumno["estado_nuevo"] | null) {
  if (status === "baja") return "Baja definitiva";
  if (status === "pausa") return "Pausa temporal";
  if (status === "activo") return "Activo";
  return "Sin estado anterior";
}

export async function GET(request: NextRequest) {
  const cycle = request.nextUrl.searchParams.get("cycle") ?? "";
  const withdrawalType = request.nextUrl.searchParams.get("type");
  const includeHistory = request.nextUrl.searchParams.get("history") === "true";
  const levelParam = request.nextUrl.searchParams.get("level");
  const gradeParam = request.nextUrl.searchParams.get("grade");
  const group = request.nextUrl.searchParams.get("group")?.trim() || null;
  const search = request.nextUrl.searchParams.get("search")?.trim().slice(0, 150) || "";
  const cycleMatch = /^(\d{4})-(\d{4})$/.exec(cycle);
  if (!cycleMatch || Number(cycleMatch[2]) !== Number(cycleMatch[1]) + 1) {
    return NextResponse.json({ error: "El ciclo escolar no es válido." }, { status: 400 });
  }
  if (levelParam && !VALID_LEVELS.has(levelParam as NivelEscolar)) {
    return NextResponse.json({ error: "El nivel no es válido." }, { status: 400 });
  }
  if (withdrawalType && withdrawalType !== "baja" && withdrawalType !== "pausa") {
    return NextResponse.json({ error: "El tipo de baja no es válido." }, { status: 400 });
  }
  const grade = gradeParam ? Number(gradeParam) : null;
  if (grade !== null && (!Number.isInteger(grade) || grade < 1 || grade > 6)) {
    return NextResponse.json({ error: "El grado no es válido." }, { status: 400 });
  }

  const supabase = await getSupabaseServerClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: "La sesión expiró. Inicia sesión nuevamente." }, { status: 401 });
  }
  if (userData.user.app_metadata.role !== "admin") {
    return NextResponse.json({ error: "No tienes permiso para exportar las bajas." }, { status: 403 });
  }

  const commonRpcParams = {
    p_ciclo_escolar: cycle,
    p_tipo_baja: (withdrawalType as "baja" | "pausa" | null) ?? null,
    p_nivel: (levelParam as NivelEscolar | null) ?? null,
    p_grado: grade,
    p_grupo: group,
    p_busqueda: search,
  };
  const filterDescription = [
    withdrawalType === "baja"
      ? "Baja definitiva"
      : withdrawalType === "pausa"
        ? "Pausa temporal"
        : "Bajas y pausas",
    levelParam ? ACADEMIC_LEVEL_LABELS[levelParam as NivelEscolar] : "Todos los niveles",
    grade ? (levelParam ? getAcademicGradeLabel(levelParam as NivelEscolar, grade) : `${grade}°`) : "Todos los grados",
    group ? `Grupo ${group}` : "Todos los grupos",
    search ? `Búsqueda: ${search}` : "Todos los alumnos",
  ];

  if (includeHistory) {
    const historyRows: ConsultaHistorialBajas["registros"] = [];
    let historySummary: Pick<
      ConsultaHistorialBajas,
      "total_eventos" | "total_salidas" | "alumnos_reactivados" | "total_reactivaciones"
    > = {
      total_eventos: 0,
      total_salidas: 0,
      alumnos_reactivados: 0,
      total_reactivaciones: 0,
    };

    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.rpc("consultar_historial_bajas_alumnos", {
        ...commonRpcParams,
        p_limite: 1000,
        p_offset: offset,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      if (offset === 0) historySummary = data;
      historyRows.push(...data.registros);
      if (data.registros.length < 1000) break;
    }

    const perStudent = new Map<string, {
      name: string;
      enrollment: string;
      withdrawals: number;
      definitive: number;
      pauses: number;
      reactivations: number;
      reactivationDates: string[];
    }>();
    for (const row of historyRows) {
      const current = perStudent.get(row.alumno_id) ?? {
        name: getFullName(row),
        enrollment: row.matricula,
        withdrawals: 0,
        definitive: 0,
        pauses: 0,
        reactivations: 0,
        reactivationDates: [],
      };
      if (row.estado_nuevo === "baja" || row.estado_nuevo === "pausa") {
        current.withdrawals += 1;
        if (row.estado_nuevo === "baja") current.definitive += 1;
        if (row.estado_nuevo === "pausa") current.pauses += 1;
      } else if (row.estado_nuevo === "activo") {
        current.reactivations += 1;
        current.reactivationDates.push(formatDate(row.fecha_evento));
      }
      perStudent.set(row.alumno_id, current);
    }

    const studentSummary = [...perStudent.values()].sort((a, b) =>
      a.name.localeCompare(b.name, "es"),
    );
    const historyLines = [
      csvRow("HISTORIAL COMPLETO DE BAJAS Y REACTIVACIONES"),
      csvRow("Ciclo escolar", cycle),
      csvRow("Filtros", filterDescription.join(" | ")),
      csvRow("Movimientos registrados", historySummary.total_eventos),
      csvRow("Movimientos de baja o pausa", historySummary.total_salidas),
      csvRow("Alumnos reactivados", historySummary.alumnos_reactivados),
      csvRow("Total de reactivaciones", historySummary.total_reactivaciones),
      "",
      csvRow("RESUMEN POR ALUMNO"),
      csvRow("Alumno", "Matrícula (CURP)", "Veces que se dio de baja", "Bajas definitivas", "Pausas temporales", "Reactivaciones", "Fechas de reactivación"),
      ...studentSummary.map((student) => csvRow(
        student.name,
        student.enrollment,
        student.withdrawals,
        student.definitive,
        student.pauses,
        student.reactivations,
        student.reactivationDates.join(" | ") || "Sin reactivaciones",
      )),
      "",
      csvRow("DETALLE DE MOVIMIENTOS"),
      csvRow("Fecha", "Movimiento", "Estado anterior", "Estado nuevo", "Alumno", "Matrícula (CURP)", "Sexo", "Nivel", "Grado / semestre", "Grupo", "Ciclo escolar", "Observación"),
      ...historyRows.map((row) => csvRow(
        formatDate(row.fecha_evento),
        row.estado_nuevo === "activo" ? "Reactivación" : statusLabel(row.estado_nuevo),
        statusLabel(row.estado_anterior),
        statusLabel(row.estado_nuevo),
        getFullName(row),
        row.matricula,
        row.sexo === "hombre" ? "Hombre" : "Mujer",
        ACADEMIC_LEVEL_LABELS[row.nivel],
        getAcademicGradeLabel(row.nivel, row.grado),
        row.grupo,
        row.ciclo_escolar,
        row.dato_historico ? "Dato migrado; fecha exacta no disponible" : "",
      )),
    ];

    return new NextResponse(`\uFEFF${historyLines.join("\r\n")}\r\n`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="historial-bajas-y-reactivaciones-${cycle}.csv"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  const rows: ConsultaBajasAlumnos["registros"] = [];
  let summary: Pick<ConsultaBajasAlumnos, "total" | "hombres" | "mujeres"> = {
    total: 0,
    hombres: 0,
    mujeres: 0,
  };
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.rpc("consultar_bajas_alumnos", {
      ...commonRpcParams,
      p_limite: 1000,
      p_offset: offset,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (offset === 0) summary = data;
    rows.push(...data.registros);
    if (data.registros.length < 1000) break;
  }

  const lines = [
    csvRow("REPORTE DE BAJAS Y PAUSAS TEMPORALES"),
    csvRow("Ciclo escolar", cycle),
    csvRow("Filtros", filterDescription.join(" | ")),
    csvRow("Total de bajas y pausas", summary.total),
    csvRow("Hombres con baja o pausa", summary.hombres),
    csvRow("Mujeres con baja o pausa", summary.mujeres),
    "",
    csvRow("Fecha del movimiento", "Tipo de baja", "Alumno", "Matrícula (CURP)", "Sexo", "Nivel", "Grado / semestre", "Grupo", "Ciclo escolar"),
    ...rows.map((row) => csvRow(
      formatDate(row.fecha_baja),
      row.tipo_baja === "baja" ? "Baja definitiva" : "Pausa temporal",
      getFullName(row),
      row.matricula,
      row.sexo === "hombre" ? "Hombre" : "Mujer",
      ACADEMIC_LEVEL_LABELS[row.nivel],
      getAcademicGradeLabel(row.nivel, row.grado),
      row.grupo,
      row.ciclo_escolar,
    )),
  ];

  return new NextResponse(`\uFEFF${lines.join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="bajas-y-pausas-${cycle}.csv"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
