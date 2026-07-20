import { getCurrentAcademicCycle } from "@/lib/academic";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import type {
  AdminDashboardOverview,
  Alumno,
  ConfiguracionCostos,
  EstadoCuenta,
  FinancialReportKpis,
  Pago,
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
>;

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

export type FinancialAccountRow = Pick<
  EstadoCuenta,
  | "id"
  | "concepto"
  | "tipo_pago"
  | "monto_esperado"
  | "monto_pagado"
  | "fecha_limite"
  | "estatus"
> & {
  alumnos: Pick<
    Alumno,
    | "id"
    | "nombre"
    | "apellido_paterno"
    | "apellido_materno"
    | "nivel"
    | "grado"
    | "grupo"
  >;
};

export type FinancialReportData = {
  rows: FinancialAccountRow[];
  kpis: FinancialReportKpis;
};

export type FinancialReportQuery = {
  page: number;
  pageSize: number;
  level: string;
  grade: string;
  group: string;
  paymentType: string;
  overdueOnly: boolean;
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
    return { students: data, total: count ?? 0 };
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

export function loadRecentPayments() {
  return loadOnce("payments:recent", async () => {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("pagos")
      .select(
        "id, monto, tipo_pago, metodo_pago, fecha_pago, mes, anio, alumnos!inner(id, nombre, apellido_paterno, apellido_materno, matricula)",
      )
      .order("fecha_pago", { ascending: false })
      .limit(20);

    if (error) throw error;
    return data as RecentPayment[];
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

export function loadFinancialReportKpis() {
  return loadOnce("reports:kpis", async () => {
    const supabase = getSupabaseBrowserClient();
    const { error: refreshError } = await supabase.rpc(
      "actualizar_estatus_estado_cuenta",
      {},
    );
    if (refreshError) throw refreshError;

    const kpisResult = await supabase.rpc("obtener_kpis_reportes_financieros", {});
    if (kpisResult.error) throw kpisResult.error;

    return {
      total_recaudado: Number(kpisResult.data.total_recaudado),
      saldo_actual_vencido: Number(kpisResult.data.saldo_actual_vencido),
      proyeccion_ingresos: Number(kpisResult.data.proyeccion_ingresos),
      alumnos_con_adeudo: Number(kpisResult.data.alumnos_con_adeudo),
    } satisfies FinancialReportKpis;
  });
}

export function loadFinancialReportPage(params: FinancialReportQuery) {
  return loadOnce(`reports:page:${JSON.stringify(params)}`, async () => {
    const supabase = getSupabaseBrowserClient();
    const from = (params.page - 1) * params.pageSize;
    let query = supabase
      .from("estado_cuenta")
      .select(
        "id, concepto, tipo_pago, monto_esperado, monto_pagado, fecha_limite, estatus, alumnos!inner(id, nombre, apellido_paterno, apellido_materno, nivel, grado, grupo)",
        { count: "exact" },
      )
      .order("fecha_limite", { ascending: true })
      .range(from, from + params.pageSize - 1);

    if (params.level !== "todos") query = query.eq("alumnos.nivel", params.level as Alumno["nivel"]);
    if (params.grade !== "todos") query = query.eq("alumnos.grado", Number(params.grade));
    if (params.group !== "todos") query = query.eq("alumnos.grupo", params.group);
    if (params.paymentType !== "todos") query = query.eq("tipo_pago", params.paymentType as Pago["tipo_pago"]);
    if (params.overdueOnly) query = query.eq("estatus", "vencido");

    const { data, count, error } = await query;
    if (error) throw error;
    return {
      rows: data as FinancialAccountRow[],
      total: count ?? 0,
    };
  });
}

export function preloadAdminRoute(href: string) {
  switch (href) {
    case "/dashboard/admin":
      return loadDashboardMetrics();
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
          overdueOnly: false,
        }),
      ]);
    case "/dashboard/admin/configuracion":
      return loadConfigurations(getCurrentAcademicCycle());
    default:
      return Promise.resolve();
  }
}
