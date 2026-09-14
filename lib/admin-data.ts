import {
  getCurrentAcademicCycle,
  getCurrentAcademicMonthIndex,
} from "@/lib/academic";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import type {
  AdminDashboardOverview,
  Alumno,
  BecadosPorTipo,
  CarteraVencidaAlumno,
  ConfiguracionCostos,
  ConsultaCarteraVencida,
  CorteDiario,
  DesgloseAlumnos,
  FinancialReportKpis,
  Pago,
  ResumenFinancieroMensual,
  StudentFilterOptions,
} from "@/types/database";

const REQUEST_TTL_MS = 5_000;

type CacheEntry<T> = {
  expiresAt: number;
  promise: Promise<T>;
};

const requestCache = new Map<string, CacheEntry<unknown>>();

function loadOnce<T>(key: string, loader: () => Promise<T>) {
  const cached = requestCache.get(key) as CacheEntry<T> | undefined;
  if (cached && cached.expiresAt > Date.now()) return cached.promise;

  const promise = loader().catch((error) => {
    requestCache.delete(key);
    throw error;
  });

  requestCache.set(key, {
    expiresAt: Date.now() + REQUEST_TTL_MS,
    promise,
  });
  return promise;
}

export function invalidateAdminData(prefix?: string) {
  if (!prefix) {
    requestCache.clear();
    return;
  }

  for (const key of requestCache.keys()) {
    if (key.startsWith(prefix)) requestCache.delete(key);
  }
}

export type StudentListItem = Pick<
  Alumno,
  | "id"
  | "nombre"
  | "apellido_paterno"
  | "apellido_materno"
  | "matricula"
  | "nivel"
  | "grado"
  | "grupo"
  | "estado"
  | "sexo"
  | "deuda_mensualidad"
  | "deuda_inscripcion"
  | "ciclo_grado_actual"
  | "promocion_habilitada"
> & {
  /** Saldo cuya fecha limite ya paso; no incluye cargos futuros. */
  saldo_vencido: number;
};

export type RecentPayment = Pick<
  Pago,
  "id" | "monto" | "tipo_pago" | "metodo_pago" | "fecha_pago" | "mes" | "anio"
> & {
  alumnos: Pick<
    Alumno,
    | "id"
    | "nombre"
    | "apellido_paterno"
    | "apellido_materno"
    | "matricula"
  >;
};

export type FinancialReportData = {
  rows: CarteraVencidaAlumno[];
  kpis: FinancialReportKpis;
};

export type FinancialReportQuery = {
  page: number;
  pageSize: number;
  level: string;
  grade: string;
  group: string;
  paymentType: string;
  search: string;
};

export type StudentDirectoryQuery = {
  page: number;
  pageSize: number;
  search: string;
  level: string;
  grade: string;
  group: string;
  academicStatus: string;
  sortKey: "matricula" | "nombre" | "trayectoria" | "estado";
  sortDirection: "asc" | "desc";
};

const defaultStudentQuery: StudentDirectoryQuery = {
  page: 1,
  pageSize: 10,
  search: "",
  level: "todos",
  grade: "todos",
  group: "todos",
  academicStatus: "todos",
  sortKey: "nombre",
  sortDirection: "asc",
};

export function loadStudents(params: Partial<StudentDirectoryQuery> = {}) {
  const queryParams = { ...defaultStudentQuery, ...params };
  return loadOnce(`students:list:${JSON.stringify(queryParams)}`, async () => {
    const supabase = getSupabaseBrowserClient();
    const ascending = queryParams.sortDirection === "asc";
    const from = (queryParams.page - 1) * queryParams.pageSize;
    let query = supabase
      .from("alumnos")
      .select(
        "id, nombre, apellido_paterno, apellido_materno, matricula, nivel, grado, grupo, estado, sexo, deuda_mensualidad, deuda_inscripcion, ciclo_grado_actual, promocion_habilitada",
        { count: "exact" },
      )
      .range(from, from + queryParams.pageSize - 1);

    const safeSearch = queryParams.search.trim().replace(/[,()%_'"\\]/g, " ");
    if (safeSearch) {
      query = query.or(
        `nombre.ilike.%${safeSearch}%,apellido_paterno.ilike.%${safeSearch}%,apellido_materno.ilike.%${safeSearch}%,matricula.ilike.%${safeSearch}%`,
      );
    }
    if (queryParams.level !== "todos") query = query.eq("nivel", queryParams.level as Alumno["nivel"]);
    if (queryParams.grade !== "todos") query = query.eq("grado", Number(queryParams.grade));
    if (queryParams.group !== "todos") query = query.eq("grupo", queryParams.group);
    if (queryParams.academicStatus !== "todos") {
      query = query.eq(
        "estado",
        queryParams.academicStatus as Alumno["estado"],
      );
    }

    if (queryParams.sortKey === "nombre") {
      query = query.order("apellido_paterno", { ascending }).order("apellido_materno", { ascending }).order("nombre", { ascending });
    } else if (queryParams.sortKey === "trayectoria") {
      query = query.order("nivel", { ascending }).order("grado", { ascending }).order("grupo", { ascending });
    } else {
      query = query.order(queryParams.sortKey, { ascending });
    }

    const { data, count, error } = await query;

    if (error) throw error;
    const students = data ?? [];
    if (students.length === 0) return { students: [], total: count ?? 0 };

    const today = getTodayInMexico();
    const { data: overdueRows, error: overdueError } = await supabase
      .from("estado_cuenta")
      .select("alumno_id, monto_esperado, monto_pagado")
      .in("alumno_id", students.map((student) => student.id))
      // La fecha de corte se considera vencida a partir del dia siguiente.
      .lt("fecha_limite", today);

    if (overdueError) throw overdueError;

    const overdueByStudent = new Map<string, number>();
    for (const row of overdueRows ?? []) {
      const pending = Math.max(
        Number(row.monto_esperado) - Number(row.monto_pagado),
        0,
      );
      overdueByStudent.set(
        row.alumno_id,
        (overdueByStudent.get(row.alumno_id) ?? 0) + pending,
      );
    }

    return {
      students: students.map((student) => ({
        ...student,
        saldo_vencido: overdueByStudent.get(student.id) ?? 0,
      })),
      total: count ?? 0,
    };
  });
}

export function loadStudentFilterOptions() {
  return loadOnce("students:filters", async () => {
    const { data, error } = await getSupabaseBrowserClient().rpc(
      "obtener_filtros_directorio_alumnos",
      {},
    );
    if (error) throw error;
    return data as StudentFilterOptions;
  });
}

function addCalendarDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function getTodayInMexico() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function loadRecentPayments(date = getTodayInMexico()) {
  return loadOnce(`payments:day:${date}`, async () => {
    const supabase = getSupabaseBrowserClient();
    const nextDate = addCalendarDays(date, 1);
    const start = new Date(`${date}T00:00:00-06:00`).toISOString();
    const end = new Date(`${nextDate}T00:00:00-06:00`).toISOString();
    const batchSize = 1_000;
    const payments: RecentPayment[] = [];

    for (let from = 0; ; from += batchSize) {
      const { data, error } = await supabase
        .from("pagos")
        .select(
          "id, monto, tipo_pago, metodo_pago, fecha_pago, mes, anio, alumnos!inner(id, nombre, apellido_paterno, apellido_materno, matricula)",
        )
        .gte("fecha_pago", start)
        .lt("fecha_pago", end)
        .order("fecha_pago", { ascending: false })
        .order("id", { ascending: false })
        .range(from, from + batchSize - 1);

      if (error) throw error;
      const batch = data as RecentPayment[];
      payments.push(...batch);
      if (batch.length < batchSize) break;
    }

    return payments;
  });
}

export function loadConfigurations(cycle: string) {
  return loadOnce(`configurations:${cycle}`, async () => {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("configuracion_costos")
      .select("nivel, costo_inscripcion, costo_mensualidad, ciclo_escolar, fecha_limite_inscripcion")
      .eq("ciclo_escolar", cycle)
      .order("nivel");

    if (error) throw error;
    return data as ConfiguracionCostos[];
  });
}

export function loadDashboardMetrics(cycle = getCurrentAcademicCycle()) {
  return loadOnce(`dashboard:metrics:${cycle}`, async () => {
    const supabase = getSupabaseBrowserClient();
    const pauseResult = await supabase.rpc(
      "aplicar_pausas_por_inscripcion_vencida",
      {},
    );
    if (pauseResult.error) throw pauseResult.error;

    const { data, error } = await supabase.rpc(
      "obtener_resumen_administrativo",
      { p_ciclo_escolar: cycle },
    );
    if (error) throw error;
    return data as AdminDashboardOverview;
  });
}

export function loadMonthlyFinancialSummary(
  cycle = getCurrentAcademicCycle(),
) {
  return loadOnce(`reports:monthly-summary:${cycle}`, async () => {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase.rpc(
      "obtener_resumen_financiero_mensual",
      { p_ciclo_escolar: cycle },
    );
    if (error) throw error;
    return data as ResumenFinancieroMensual;
  });
}

export function loadDailyClosing(date = getTodayInMexico()) {
  return loadOnce(`dashboard:daily-closing:${date}`, async () => {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase.rpc("obtener_corte_diario", {
      p_fecha: date,
    });
    if (error) throw error;
    return data as CorteDiario;
  });
}

export function loadStudentBreakdown(cycle = getCurrentAcademicCycle()) {
  return loadOnce(`dashboard:student-breakdown:${cycle}`, async () => {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase.rpc("obtener_desglose_alumnos", {
      p_ciclo_escolar: cycle,
    });
    if (error) throw error;
    return data as DesgloseAlumnos;
  });
}

export function loadScholarshipBreakdown(cycle = getCurrentAcademicCycle()) {
  return loadOnce(`dashboard:scholarships-by-type:${cycle}`, async () => {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase.rpc("obtener_becados_por_tipo", {
      p_ciclo_escolar: cycle,
    });
    if (error) throw error;
    return data as BecadosPorTipo;
  });
}

export function loadFinancialReportKpis() {
  const cycle = getCurrentAcademicCycle();
  const monthIndex = getCurrentAcademicMonthIndex();
  return loadOnce(`reports:kpis:${cycle}:${monthIndex}`, async () => {
    const supabase = getSupabaseBrowserClient();
    const { error: refreshError } = await supabase.rpc(
      "actualizar_estatus_estado_cuenta",
      {},
    );
    if (refreshError) throw refreshError;

    const [kpisResult, monthlyResult] = await Promise.all([
      supabase.rpc("obtener_kpis_reportes_financieros", {}),
      supabase.rpc("obtener_resumen_financiero_mensual", {
        p_ciclo_escolar: cycle,
      }),
    ]);
    if (kpisResult.error) throw kpisResult.error;
    if (monthlyResult.error) throw monthlyResult.error;

    const currentMonth = monthlyResult.data.meses[monthIndex];
    if (!currentMonth) {
      throw new Error("No fue posible identificar el periodo financiero actual.");
    }

    return {
      proyeccion_mensual: Number(currentMonth.proyectado),
      pagado_aplicado_periodo: Number(currentMonth.pagado),
      adeudo_pendiente_mes: Number(currentMonth.adeudo),
      alumnos_con_adeudo: Number(kpisResult.data.alumnos_con_adeudo),
    } satisfies FinancialReportKpis;
  });
}

export function loadFinancialReportPage(params: FinancialReportQuery) {
  return loadOnce(`reports:page:${JSON.stringify(params)}`, async () => {
    const { data, error } = await getSupabaseBrowserClient().rpc(
      "consultar_cartera_vencida_alumnos",
      {
        p_nivel: params.level === "todos" ? null : params.level as Alumno["nivel"],
        p_grado: params.grade === "todos" ? null : Number(params.grade),
        p_grupo: params.group === "todos" ? null : params.group,
        p_tipo_pago: params.paymentType === "todos" ? null : params.paymentType as Pago["tipo_pago"],
        p_busqueda: params.search,
        p_limite: params.pageSize,
        p_offset: (params.page - 1) * params.pageSize,
      },
    );
    if (error) throw error;
    const result = data as ConsultaCarteraVencida;
    return {
      rows: result.registros,
      total: result.total_alumnos,
      totalBalance: result.total_saldo_vencido,
    };
  });
}

export function preloadAdminRoute(href: string) {
  switch (href) {
    case "/dashboard/admin":
      return Promise.all([
        loadDashboardMetrics(),
        loadMonthlyFinancialSummary(),
        loadDailyClosing(),
        loadStudentBreakdown(),
        loadScholarshipBreakdown(),
      ]);
    case "/dashboard/admin/alumnos":
      return loadStudents();
    case "/dashboard/admin/pagos":
      return loadRecentPayments();
    case "/dashboard/admin/reportes":
      return Promise.all([
        loadFinancialReportKpis(),
        loadFinancialReportPage({
          page: 1,
          pageSize: 10,
          level: "todos",
          grade: "todos",
          group: "todos",
          paymentType: "todos",
          search: "",
        }),
      ]);
    case "/dashboard/admin/configuracion":
      return loadConfigurations(getCurrentAcademicCycle());
    default:
      return Promise.resolve();
  }
}
