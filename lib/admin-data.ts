import { getCurrentAcademicCycle } from "@/lib/academic";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import type {
  Alumno,
  ConfiguracionCostos,
  EstadoCuenta,
  FinancialReportKpis,
  Pago,
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
>;

export type RecentPayment = Pick<
  Pago,
  "id" | "monto" | "tipo_pago" | "fecha_pago" | "mes" | "anio"
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

export type DashboardMetrics = {
  activeStudents: number;
  totalDebt: number;
  monthlyPayments: number;
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

export function loadStudents() {
  return loadOnce("students:list", async () => {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("alumnos")
      .select(
        "id, nombre, apellido_paterno, apellido_materno, matricula, nivel, grado, grupo, estado, sexo, deuda_mensualidad, deuda_inscripcion",
      )
      .order("apellido_paterno")
      .order("apellido_materno")
      .order("nombre");

    if (error) throw error;
    return data;
  });
}

export function loadRecentPayments() {
  return loadOnce("payments:recent", async () => {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("pagos")
      .select(
        "id, monto, tipo_pago, fecha_pago, mes, anio, alumnos!inner(id, nombre, apellido_paterno, apellido_materno, matricula)",
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
      .select("nivel, costo_inscripcion, costo_mensualidad, ciclo_escolar")
      .eq("ciclo_escolar", cycle)
      .order("nivel");

    if (error) throw error;
    return data as ConfiguracionCostos[];
  });
}

export function loadDashboardMetrics() {
  return loadOnce("dashboard:metrics", async () => {
    const supabase = getSupabaseBrowserClient();
    const today = new Date();
    const startOfMonth = new Date(
      today.getFullYear(),
      today.getMonth(),
      1,
    ).toISOString();

    const [studentsResult, paymentsResult] = await Promise.all([
      supabase
        .from("alumnos")
        .select("deuda_mensualidad, deuda_inscripcion")
        .eq("estado", "activo"),
      supabase
        .from("pagos")
        .select("id", { count: "exact", head: true })
        .gte("fecha_pago", startOfMonth),
    ]);

    if (studentsResult.error) throw studentsResult.error;
    if (paymentsResult.error) throw paymentsResult.error;

    return {
      activeStudents: studentsResult.data.length,
      totalDebt: studentsResult.data.reduce(
        (total, student) =>
          total + student.deuda_mensualidad + student.deuda_inscripcion,
        0,
      ),
      monthlyPayments: paymentsResult.count ?? 0,
    } satisfies DashboardMetrics;
  });
}

export function loadFinancialReportData() {
  return loadOnce("reports:financial", async () => {
    const supabase = getSupabaseBrowserClient();
    const { error: refreshError } = await supabase.rpc(
      "actualizar_estatus_estado_cuenta",
      {},
    );
    if (refreshError) throw refreshError;

    const [accountsResult, kpisResult] = await Promise.all([
      supabase
        .from("estado_cuenta")
        .select(
          "id, concepto, tipo_pago, monto_esperado, monto_pagado, fecha_limite, estatus, alumnos!inner(id, nombre, apellido_paterno, apellido_materno, nivel, grado, grupo)",
        )
        .order("fecha_limite", { ascending: true }),
      supabase.rpc("obtener_kpis_reportes_financieros", {}),
    ]);

    if (accountsResult.error) throw accountsResult.error;
    if (kpisResult.error) throw kpisResult.error;

    return {
      rows: accountsResult.data as FinancialAccountRow[],
      kpis: {
        total_recaudado: Number(kpisResult.data.total_recaudado),
        saldo_actual_vencido: Number(
          kpisResult.data.saldo_actual_vencido,
        ),
        proyeccion_ingresos: Number(kpisResult.data.proyeccion_ingresos),
        alumnos_con_adeudo: Number(kpisResult.data.alumnos_con_adeudo),
      },
    } satisfies FinancialReportData;
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
      return loadFinancialReportData();
    case "/dashboard/admin/configuracion":
      return loadConfigurations(getCurrentAcademicCycle());
    default:
      return Promise.resolve();
  }
}
