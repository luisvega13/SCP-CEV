"use client";

import { useCallback, useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  BadgePercent,
  Banknote,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  CreditCard,
  FilePenLine,
  GraduationCap,
  Landmark,
  LoaderCircle,
  PauseCircle,
  ReceiptText,
  RefreshCw,
  School,
  ShieldCheck,
  Trash2,
  TrendingDown,
  TrendingUp,
  UserMinus,
  Users,
  WalletCards,
} from "lucide-react";
import { getPaymentMethodLabel } from "@/lib/payments";
import { loadDashboardMetrics } from "@/lib/admin-data";
import type {
  AdminDashboardOverview,
  EstatusCobro,
  NivelEscolar,
} from "@/types/database";

const currencyFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat("es-MX");

const dateTimeFormatter = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Mexico_City",
});

const shortDateFormatter = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "short",
  timeZone: "America/Mexico_City",
});

const LEVEL_LABELS: Record<NivelEscolar, string> = {
  primaria: "Primaria",
  secundaria: "Secundaria",
  bachillerato: "Bachillerato",
};

const STATUS_META: Record<
  EstatusCobro,
  { label: string; className: string }
> = {
  pagado: { label: "Pagados", className: "bg-emerald-500" },
  parcial: { label: "Parciales", className: "bg-amber-400" },
  vencido: { label: "Vencidos", className: "bg-red-500" },
  pendiente: { label: "Pendientes", className: "bg-slate-300" },
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return "No fue posible cargar el resumen administrativo.";
}

function MetricCard({
  label,
  value,
  description,
  icon: Icon,
  tone,
  isLoading,
}: {
  label: string;
  value: string;
  description: string;
  icon: LucideIcon;
  tone: "sky" | "emerald" | "amber" | "red" | "violet" | "slate";
  isLoading: boolean;
}) {
  const tones = {
    sky: "border-sky-200 bg-sky-50 text-sky-950 [&_.metric-icon]:bg-sky-100 [&_.metric-icon]:text-sky-700",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-950 [&_.metric-icon]:bg-emerald-100 [&_.metric-icon]:text-emerald-700",
    amber: "border-amber-200 bg-amber-50 text-amber-950 [&_.metric-icon]:bg-amber-100 [&_.metric-icon]:text-amber-700",
    red: "border-red-200 bg-red-50 text-red-950 [&_.metric-icon]:bg-red-100 [&_.metric-icon]:text-red-700",
    violet: "border-violet-200 bg-violet-50 text-violet-950 [&_.metric-icon]:bg-violet-100 [&_.metric-icon]:text-violet-700",
    slate: "border-slate-200 bg-white text-slate-950 [&_.metric-icon]:bg-slate-100 [&_.metric-icon]:text-slate-600",
  };

  return (
    <article className={`rounded-2xl border p-5 shadow-sm ${tones[tone]}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold opacity-75">{label}</p>
        <span className="metric-icon grid h-9 w-9 shrink-0 place-items-center rounded-lg">
          <Icon className="h-4.5 w-4.5" aria-hidden="true" />
        </span>
      </div>
      {isLoading ? (
        <div className="mt-3 h-9 w-32 animate-pulse rounded bg-current opacity-10" />
      ) : (
        <p className="mt-3 text-2xl font-bold tabular-nums sm:text-3xl">{value}</p>
      )}
      <p className="mt-2 text-xs leading-5 opacity-65">{description}</p>
    </article>
  );
}

function MiniStat({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail?: string;
  icon: LucideIcon;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
      <div className="flex items-center gap-2 text-slate-500">
        <Icon className="h-4 w-4" aria-hidden="true" />
        <p className="text-xs font-semibold uppercase tracking-wide">{label}</p>
      </div>
      <p className="mt-2 text-xl font-bold tabular-nums text-slate-950">{value}</p>
      {detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}
    </div>
  );
}

function SectionCard({
  title,
  description,
  children,
  className = "",
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 ${className}`}>
      <div>
        <h2 className="text-lg font-bold text-slate-950">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      <div className="mt-6">{children}</div>
    </section>
  );
}

export default function AdminDashboardPage() {
  const [overview, setOverview] = useState<AdminDashboardOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadOverview = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      setOverview(await loadDashboardMetrics());
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const finance = overview?.finance;
  const students = overview?.students;
  const monthChange = finance?.month_change_percent ?? null;
  const trendMaximum = Math.max(
    1,
    ...(overview?.monthly_trend.map((item) => item.amount) ?? [0]),
  );
  const paymentMethodTotal =
    overview?.payments_by_method.reduce((sum, item) => sum + item.amount, 0) ?? 0;

  const mainCards = [
    {
      label: "Recaudado este mes",
      value: currencyFormatter.format(finance?.collected_month ?? 0),
      description: `${numberFormatter.format(finance?.payment_count_month ?? 0)} movimientos registrados`,
      icon: CircleDollarSign,
      tone: "emerald" as const,
    },
    {
      label: "Saldo vencido histórico",
      value: currencyFormatter.format(finance?.overdue_balance ?? 0),
      description: `${numberFormatter.format(finance?.overdue_charges ?? 0)} cargos fuera de fecha`,
      icon: AlertTriangle,
      tone: "red" as const,
    },
    {
      label: "Alumnos con adeudo",
      value: numberFormatter.format(finance?.students_with_overdue ?? 0),
      description: "Alumnos únicos con saldo vencido",
      icon: Users,
      tone: "amber" as const,
    },
    {
      label: "Eficiencia de cobranza",
      value: `${numberFormatter.format(finance?.collection_rate ?? 0)}%`,
      description: "Porcentaje cubierto de cargos ya devengados",
      icon: ShieldCheck,
      tone: "sky" as const,
    },
    {
      label: "Alumnos activos",
      value: numberFormatter.format(students?.active ?? 0),
      description: `${numberFormatter.format(students?.total ?? 0)} alumnos registrados en total`,
      icon: GraduationCap,
      tone: "slate" as const,
    },
    {
      label: "Alumnos con beca",
      value: numberFormatter.format(overview?.scholarships.students ?? 0),
      description: `${numberFormatter.format(overview?.scholarships.assignments ?? 0)} asignaciones en el ciclo`,
      icon: BadgePercent,
      tone: "violet" as const,
    },
  ];

  return (
    <section className="mx-auto max-w-[1600px] pb-12">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-sky-600">Panel administrativo</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-950">Resumen general</h1>
          <p className="mt-2 text-sm text-slate-500">
            Visibilidad académica, financiera y operativa del centro escolar.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {overview && (
            <div className="hidden text-right sm:block">
              <p className="text-xs font-semibold text-slate-600">Ciclo {overview.cycle}</p>
              <p className="mt-0.5 text-xs text-slate-400">
                Actualizado {dateTimeFormatter.format(new Date(overview.generated_at))}
              </p>
            </div>
          )}
          <button type="button" onClick={() => void loadOverview()} disabled={isLoading} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            Actualizar
          </button>
        </div>
      </header>

      {error && (
        <div role="alert" className="mt-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">No se pudieron cargar las estadísticas</p>
            <p className="mt-1">{error}</p>
          </div>
        </div>
      )}

      <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {mainCards.map((card) => (
          <MetricCard key={card.label} {...card} isLoading={isLoading} />
        ))}
      </div>

      {isLoading && !overview ? (
        <div className="mt-6 flex min-h-72 items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm text-slate-500">
          <LoaderCircle className="mr-2 h-5 w-5 animate-spin" />Preparando indicadores...
        </div>
      ) : overview ? (
        <>
          <div className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_1fr]">
            <SectionCard title="Cobranza del periodo" description="Indicadores de liquidez, cartera y comportamiento frente al mes anterior.">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MiniStat label="Cobrado hoy" value={currencyFormatter.format(finance?.collected_today ?? 0)} detail={`${numberFormatter.format(finance?.payment_count_today ?? 0)} movimientos`} icon={Banknote} />
                <MiniStat label="Ticket promedio" value={currencyFormatter.format(finance?.average_ticket_month ?? 0)} detail="Promedio por movimiento del mes" icon={ReceiptText} />
                <MiniStat label="Recaudado en ciclo" value={currencyFormatter.format(finance?.collected_cycle ?? 0)} detail={`Ciclo ${overview.cycle}`} icon={WalletCards} />
                <MiniStat label="Próximos 30 días" value={currencyFormatter.format(finance?.due_next_30_days ?? 0)} detail="Saldo todavía no vencido" icon={CalendarClock} />
              </div>
              <div className="mt-4 flex flex-col gap-3 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-800">Comparación mensual</p>
                  <p className="mt-1 text-xs text-slate-500">Mes anterior: {currencyFormatter.format(finance?.collected_previous_month ?? 0)}</p>
                </div>
                {monthChange === null ? (
                  <span className="text-sm font-semibold text-slate-500">Sin base de comparación</span>
                ) : (
                  <span className={`inline-flex items-center gap-1.5 text-sm font-bold ${monthChange >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                    {monthChange >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                    {monthChange > 0 ? "+" : ""}{numberFormatter.format(monthChange)}%
                  </span>
                )}
              </div>
            </SectionCard>

            <SectionCard title="Situación académica" description="Distribución del padrón por estado institucional.">
              <div className="grid grid-cols-2 gap-3">
                <MiniStat label="Total" value={numberFormatter.format(students?.total ?? 0)} icon={Users} />
                <MiniStat label="Activos" value={numberFormatter.format(students?.active ?? 0)} icon={CheckCircle2} />
                <MiniStat label="En pausa" value={numberFormatter.format(students?.paused ?? 0)} icon={PauseCircle} />
                <MiniStat label="Bajas" value={numberFormatter.format(students?.withdrawn ?? 0)} icon={UserMinus} />
              </div>
              <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Cobertura de becas: <span className="font-semibold text-slate-950">{students?.active ? numberFormatter.format((overview.scholarships.students / students.active) * 100) : 0}%</span> de los alumnos activos · descuento promedio <span className="font-semibold text-slate-950">{numberFormatter.format(overview.scholarships.average_percentage)}%</span>
              </div>
            </SectionCard>
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <SectionCard title="Tendencia de ingresos" description="Recaudación real de los últimos seis meses.">
              <div className="flex h-64 items-end gap-2 sm:gap-4">
                {overview.monthly_trend.map((item) => {
                  const height = item.amount === 0 ? 4 : Math.max(12, (item.amount / trendMaximum) * 100);
                  const label = new Intl.DateTimeFormat("es-MX", { month: "short" }).format(new Date(`${item.month}-15T12:00:00`));
                  return (
                    <div key={item.month} className="group flex h-full min-w-0 flex-1 flex-col justify-end text-center">
                      <p className="mb-2 hidden truncate text-xs font-semibold tabular-nums text-slate-700 sm:block">{currencyFormatter.format(item.amount)}</p>
                      <div className="relative flex h-44 items-end justify-center rounded-lg bg-slate-50 px-1">
                        <div title={`${currencyFormatter.format(item.amount)} · ${item.count} movimientos`} style={{ height: `${height}%` }} className="w-full max-w-12 rounded-t-md bg-sky-500 transition group-hover:bg-sky-600" />
                      </div>
                      <p className="mt-2 text-xs font-medium capitalize text-slate-500">{label}</p>
                      <p className="mt-0.5 text-[11px] text-slate-400">{item.count} mov.</p>
                    </div>
                  );
                })}
              </div>
            </SectionCard>

            <SectionCard title="Estado de los cargos" description={`Situación de inscripción y mensualidades del ciclo ${overview.cycle}.`}>
              <div className="space-y-4">
                {(["pagado", "parcial", "vencido", "pendiente"] as EstatusCobro[]).map((status) => {
                  const item = overview.account_status.find((row) => row.status === status);
                  const totalCharges = overview.account_status.reduce((sum, row) => sum + row.count, 0);
                  const width = totalCharges ? ((item?.count ?? 0) / totalCharges) * 100 : 0;
                  return (
                    <div key={status}>
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <div className="flex items-center gap-2">
                          <span className={`h-2.5 w-2.5 rounded-full ${STATUS_META[status].className}`} />
                          <span className="font-medium text-slate-700">{STATUS_META[status].label}</span>
                        </div>
                        <div className="text-right">
                          <span className="font-bold tabular-nums text-slate-950">{numberFormatter.format(item?.count ?? 0)}</span>
                          {status !== "pagado" && <span className="ml-2 text-xs text-slate-500">{currencyFormatter.format(item?.balance ?? 0)}</span>}
                        </div>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className={`h-full rounded-full ${STATUS_META[status].className}`} style={{ width: `${width}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-6 grid grid-cols-2 gap-3">
                <MiniStat label="Cartera total" value={currencyFormatter.format(finance?.total_receivable ?? 0)} icon={CircleDollarSign} />
                <MiniStat label="Cargos vencidos" value={numberFormatter.format(finance?.overdue_charges ?? 0)} icon={Clock3} />
              </div>
            </SectionCard>
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_1fr_1fr]">
            <SectionCard title="Alumnos y cartera por nivel" description="Padrón, cobranza del ciclo y saldo pendiente por nivel.">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px]">
                  <thead><tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500"><th className="pb-3 font-semibold">Nivel</th><th className="pb-3 text-right font-semibold">Activos / Total</th><th className="pb-3 text-right font-semibold">Recaudado</th><th className="pb-3 text-right font-semibold">Pendiente</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {overview.students_by_level.map((item) => (
                      <tr key={item.level}>
                        <td className="py-4 text-sm font-semibold text-slate-900"><span className="inline-flex items-center gap-2"><School className="h-4 w-4 text-slate-400" />{LEVEL_LABELS[item.level]}</span></td>
                        <td className="py-4 text-right text-sm tabular-nums text-slate-600">{item.active} / {item.total}</td>
                        <td className="py-4 text-right text-sm font-semibold tabular-nums text-emerald-700">{currencyFormatter.format(item.collected_cycle)}</td>
                        <td className="py-4 text-right text-sm font-semibold tabular-nums text-slate-900">{currencyFormatter.format(item.outstanding)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>

            <SectionCard title="Tipo de cobro" description="Composición de los ingresos del mes actual.">
              <div className="space-y-4">
                {overview.payments_by_type.map((item) => {
                  const total = overview.payments_by_type.reduce((sum, row) => sum + row.amount, 0);
                  const percentage = total ? (item.amount / total) * 100 : 0;
                  return (
                    <div key={item.type} className="rounded-xl border border-slate-200 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div><p className="text-sm font-semibold capitalize text-slate-800">{item.type}</p><p className="mt-1 text-xs text-slate-500">{item.count} movimientos</p></div>
                        <p className="text-sm font-bold tabular-nums text-slate-950">{currencyFormatter.format(item.amount)}</p>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-sky-500" style={{ width: `${percentage}%` }} /></div>
                    </div>
                  );
                })}
              </div>
            </SectionCard>

            <SectionCard title="Métodos de pago" description="Preferencias de pago observadas este mes.">
              <div className="space-y-4">
                {overview.payments_by_method.map((item) => {
                  const percentage = paymentMethodTotal ? (item.amount / paymentMethodTotal) * 100 : 0;
                  const MethodIcon = item.method === "efectivo" ? Banknote : item.method === "tarjeta" ? CreditCard : Landmark;
                  return (
                    <div key={item.method}>
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="inline-flex items-center gap-2 font-medium text-slate-700"><MethodIcon className="h-4 w-4 text-slate-400" />{getPaymentMethodLabel(item.method)}</span>
                        <span className="font-semibold tabular-nums text-slate-950">{currencyFormatter.format(item.amount)}</span>
                      </div>
                      <div className="mt-2 flex items-center gap-3"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-violet-500" style={{ width: `${percentage}%` }} /></div><span className="w-12 text-right text-xs text-slate-400">{item.count} mov.</span></div>
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_0.6fr]">
            <SectionCard title="Actividad reciente" description="Últimos pagos registrados en el sistema.">
              {overview.recent_payments.length === 0 ? (
                <p className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">Todavía no hay pagos registrados.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {overview.recent_payments.map((payment) => (
                    <div key={payment.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">{payment.student_name}</p>
                        <p className="mt-1 text-xs text-slate-500">{payment.matricula} · <span className="capitalize">{payment.tipo_pago}</span> · {getPaymentMethodLabel(payment.metodo_pago)}</p>
                      </div>
                      <div className="shrink-0 sm:text-right">
                        <p className="text-sm font-bold tabular-nums text-emerald-700">{currencyFormatter.format(payment.monto)}</p>
                        <p className="mt-1 text-xs text-slate-400">{shortDateFormatter.format(new Date(payment.fecha_pago))}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard title="Control y auditoría" description="Correcciones sensibles realizadas durante el mes.">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <MiniStat label="Pagos modificados" value={numberFormatter.format(overview.audit.edits_this_month)} detail="Con motivo y reautenticación" icon={FilePenLine} />
                <MiniStat label="Pagos eliminados" value={numberFormatter.format(overview.audit.deletions_this_month)} detail="Respaldados en auditoría" icon={Trash2} />
              </div>
            </SectionCard>
          </div>
        </>
      ) : null}
    </section>
  );
}
