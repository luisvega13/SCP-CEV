"use client";

import { useEffect, useState } from "react";
import {
  Bell,
  ChartNoAxesCombined,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Download,
  LoaderCircle,
  Search,
  TriangleAlert,
  Users,
} from "lucide-react";
import { TableSkeletonRows } from "@/components/TableSkeletonRows";
import {
  ACADEMIC_LEVEL_LABELS,
  ACADEMIC_LEVELS,
  getAcademicGradeLabel,
  getCurrentAcademicCycle,
  getCycleStartYear,
  getFullStudentName,
  getMaximumGrade,
} from "@/lib/academic";
import {
  loadFinancialReportKpis,
  loadFinancialReportPage,
  loadStudentFilterOptions,
} from "@/lib/admin-data";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import type {
  CarteraVencidaAlumno,
  FinancialReportKpis,
  NivelEscolar,
  StudentFilterOptions,
  TipoPago,
} from "@/types/database";

type FinancialRow = CarteraVencidaAlumno;
const PAGE_SIZE = 10;

const EMPTY_KPIS: FinancialReportKpis = {
  proyeccion_mensual: 0,
  pagado_aplicado_periodo: 0,
  adeudo_pendiente_mes: 0,
  alumnos_con_adeudo: 0,
};

const currencyFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

const dateFormatter = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "America/Mexico_City",
});

const selectClass =
  "mt-2 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-700 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100";

function getErrorMessage(error: unknown, fallback: string) {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return fallback;
}

function parseDate(value: string) {
  return new Date(`${value}T00:00:00-06:00`);
}

function normalizeWhatsAppPhone(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 10) digits = `52${digits}`;
  return digits.length >= 11 && digits.length <= 15 ? digits : null;
}

export function FinancialReports() {
  const [rows, setRows] = useState<FinancialRow[]>([]);
  const [kpis, setKpis] = useState<FinancialReportKpis>(EMPTY_KPIS);
  const [levelFilter, setLevelFilter] = useState("todos");
  const [gradeFilter, setGradeFilter] = useState("todos");
  const [groupFilter, setGroupFilter] = useState("todos");
  const [paymentFilter, setPaymentFilter] = useState<TipoPago | "todos">(
    "todos",
  );
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [reminderError, setReminderError] = useState("");
  const [remindingId, setRemindingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [filterOptions, setFilterOptions] = useState<StudentFilterOptions>({ grados: [], grupos: [] });
  const [exportCycle, setExportCycle] = useState(getCurrentAcademicCycle);
  const [isDownloadingMonthly, setIsDownloadingMonthly] = useState(false);
  const [exportError, setExportError] = useState("");

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    let isMounted = true;

    async function loadFinancialReport() {
      setIsLoading(true);
      setError(null);

      try {
        const [pageData, kpiData] = await Promise.all([
          loadFinancialReportPage({
            page,
            pageSize: PAGE_SIZE,
            level: levelFilter,
            grade: gradeFilter,
            group: groupFilter,
            paymentType: paymentFilter,
            search: debouncedSearch,
          }),
          loadFinancialReportKpis(),
        ]);

        if (isMounted) {
          setRows(pageData.rows);
          setTotal(pageData.total);
          setKpis(kpiData);
        }
      } catch (caughtError) {
        if (isMounted) {
          setError(
            getErrorMessage(
              caughtError,
              "No fue posible cargar los reportes financieros.",
            ),
          );
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    void loadFinancialReport();
    return () => {
      isMounted = false;
    };
  }, [debouncedSearch, gradeFilter, groupFilter, levelFilter, page, paymentFilter]);

  useEffect(() => {
    loadStudentFilterOptions().then(setFilterOptions).catch(() => undefined);
  }, []);

  const levels = ACADEMIC_LEVELS;
  const grades = filterOptions.grados.filter((grade) =>
    levelFilter === "todos"
      ? true
      : grade <= getMaximumGrade(levelFilter as NivelEscolar),
  );
  const groups = filterOptions.grupos;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function moveExportCycle(offset: number) {
    const nextStartYear = getCycleStartYear(exportCycle) + offset;
    setExportCycle(`${nextStartYear}-${nextStartYear + 1}`);
    setExportError("");
  }

  async function downloadMonthlyFinance() {
    setIsDownloadingMonthly(true);
    setExportError("");
    try {
      const endpoint = `/api/admin/exports/monthly-finance?cycle=${encodeURIComponent(exportCycle)}`;
      const response = await fetch(endpoint, { cache: "no-store" });
      if (!response.ok) {
        const result = (await response.json()) as { error?: string };
        throw new Error(result.error || "No fue posible generar el archivo CSV.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `resumen-financiero-${exportCycle}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (caughtError) {
      setExportError(
        getErrorMessage(caughtError, "No fue posible generar el archivo CSV."),
      );
    } finally {
      setIsDownloadingMonthly(false);
    }
  }

  async function sendReminder(row: FinancialRow) {
    const studentName = getFullStudentName(row);
    setNotice("");
    setReminderError("");
    setRemindingId(row.alumno_id);

    // Se abre durante el clic para evitar que el navegador bloquee la pestaña
    // mientras se consulta el teléfono en Supabase.
    const whatsappWindow = window.open("about:blank", "whatsapp-reminder");

    try {
      const { data: tutor, error: tutorError } = await getSupabaseBrowserClient()
        .from("tutores_alumnos")
        .select("nombre, telefono")
        .eq("alumno_id", row.alumno_id)
        .eq("posicion", 1)
        .maybeSingle();

      if (tutorError) throw tutorError;
      if (!tutor) {
        throw new Error(
          `No hay un tutor principal registrado para ${studentName}. Regístralo desde el perfil del alumno.`,
        );
      }

      const phone = normalizeWhatsAppPhone(tutor.telefono);
      if (!phone) {
        throw new Error(
          `El teléfono del tutor principal de ${studentName} no es válido para WhatsApp.`,
        );
      }

      const debtDetail = row.cargos
        .map((charge) => `• ${charge.concepto}: ${currencyFormatter.format(charge.saldo)} (venció el ${dateFormatter.format(parseDate(charge.fecha_limite))})`)
        .join("\n");
      const message = `Hola ${tutor.nombre}. Le enviamos un recordatorio del estado de cuenta de ${studentName}. El saldo vencido total es de ${currencyFormatter.format(row.saldo_vencido)}, correspondiente a:\n\n${debtDetail}\n\nSi ya realizó alguno de estos pagos, por favor ignore este mensaje o comuníquese con administración para una aclaración.`;
      const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

      if (whatsappWindow) {
        whatsappWindow.opener = null;
        whatsappWindow.location.replace(whatsappUrl);
      } else {
        window.location.assign(whatsappUrl);
      }
      setNotice(`Recordatorio preparado para ${tutor.nombre} (${tutor.telefono}).`);
    } catch (caughtError) {
      whatsappWindow?.close();
      setReminderError(
        getErrorMessage(caughtError, "No fue posible preparar el recordatorio."),
      );
    } finally {
      setRemindingId(null);
    }
  }

  const cards = [
    {
      label: "Proyección mensual (MXN)",
      value: currencyFormatter.format(kpis.proyeccion_mensual),
      icon: ChartNoAxesCombined,
      iconStyle: "bg-sky-50 text-sky-700",
    },
    {
      label: "Pagado aplicado al periodo (MXN)",
      value: currencyFormatter.format(kpis.pagado_aplicado_periodo),
      icon: CircleDollarSign,
      iconStyle: "bg-emerald-50 text-emerald-700",
    },
    {
      label: "Adeudo pendiente del mes (MXN)",
      value: currencyFormatter.format(kpis.adeudo_pendiente_mes),
      icon: TriangleAlert,
      iconStyle: "bg-orange-50 text-orange-700",
    },
    {
      label: "Alumnos con Adeudo",
      value: kpis.alumnos_con_adeudo.toLocaleString("es-MX"),
      icon: Users,
      iconStyle: "bg-red-50 text-red-700",
    },
  ];

  return (
    <section className="mx-auto max-w-7xl">
      <header>
        <div>
          <p className="text-sm font-medium text-sky-600">Administración</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-950">
            Reportes financieros
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Cartera vencida consolidada por alumno para seguimiento y recordatorios de pago.
          </p>
        </div>
      </header>

      {error && (
        <p role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-6 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-800">
          {notice}
        </p>
      )}
      {reminderError && (
        <p role="alert" className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {reminderError}
        </p>
      )}

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="financial-export-title">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h2 id="financial-export-title" className="text-base font-semibold text-slate-950">Exportación financiera</h2>
            <p className="mt-1 text-sm text-slate-500">Descarga el comportamiento financiero mensual del ciclo escolar.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:flex xl:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Ciclo del reporte financiero</p>
              <div className="mt-2 inline-flex w-full items-stretch rounded-lg border border-slate-300 bg-white sm:w-auto">
                <button type="button" onClick={() => moveExportCycle(-1)} aria-label="Ciclo escolar anterior" className="rounded-l-lg px-3 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"><ChevronLeft className="h-4 w-4" /></button>
                <span className="min-w-32 border-x border-slate-200 px-4 py-2 text-center text-sm font-semibold text-slate-800">{exportCycle}</span>
                <button type="button" onClick={() => moveExportCycle(1)} aria-label="Ciclo escolar siguiente" className="rounded-r-lg px-3 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"><ChevronRight className="h-4 w-4" /></button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void downloadMonthlyFinance()}
              disabled={isDownloadingMonthly}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-sky-200 bg-white px-4 py-2.5 text-sm font-semibold text-sky-700 transition hover:bg-sky-50 disabled:cursor-wait disabled:opacity-50"
            >
              {isDownloadingMonthly ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Finanzas por mes
            </button>
          </div>
        </div>
        {exportError && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{exportError}</p>}
      </section>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <article key={card.label} className="rounded-xl border border-slate-200 bg-white p-5 text-slate-950 shadow-sm shadow-slate-200/50">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-slate-600">{card.label}</p>
                <span className={`grid h-9 w-9 place-items-center rounded-lg ${card.iconStyle}`}>
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
              </div>
              {isLoading ? (
                <div className="mt-4 h-8 w-32 animate-pulse rounded bg-current opacity-10" />
              ) : (
                <p className="mt-3 text-2xl font-bold tabular-nums">{card.value}</p>
              )}
            </article>
          );
        })}
      </div>

      <div className="mt-8 grid gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2 xl:grid-cols-4">
        <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 sm:col-span-2 xl:col-span-4">
          Buscar alumno
          <div className="relative mt-2">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(event) => { setSearch(event.target.value); setPage(1); }}
              placeholder="Nombre, apellidos o matrícula (CURP)..."
              className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3.5 text-sm font-normal normal-case tracking-normal text-slate-700 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            />
          </div>
        </label>
        <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Nivel
          <select
            value={levelFilter}
            onChange={(event) => {
              setLevelFilter(event.target.value);
              setGradeFilter("todos");
              setGroupFilter("todos");
              setPage(1);
            }}
            className={selectClass}
          >
            <option value="todos">Todos los niveles</option>
            {levels.map((level) => (
              <option key={level} value={level} className="capitalize">
                {ACADEMIC_LEVEL_LABELS[level]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Grado
          <select
            value={gradeFilter}
            onChange={(event) => {
              setGradeFilter(event.target.value);
              setGroupFilter("todos");
              setPage(1);
            }}
            className={selectClass}
          >
            <option value="todos">Todos los grados</option>
            {grades.map((grade) => (
              <option key={grade} value={grade}>{grade}°</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Grupo
          <select value={groupFilter} onChange={(event) => { setGroupFilter(event.target.value); setPage(1); }} className={selectClass}>
            <option value="todos">Todos los grupos</option>
            {groups.map((group) => (
              <option key={group} value={group}>{group}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Tipo de pago
          <select value={paymentFilter} onChange={(event) => { setPaymentFilter(event.target.value as TipoPago | "todos"); setPage(1); }} className={selectClass}>
            <option value="todos">Todos los tipos</option>
            <option value="inscripcion">Inscripción</option>
            <option value="mensualidad">Mensualidad</option>
          </select>
        </label>
      </div>

      <div className="mt-6 w-full max-w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm [contain:inline-size]">
        <div className="w-full max-w-full overflow-x-auto overscroll-x-contain">
          <table className="w-full min-w-[980px] divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                {["Alumno", "Nivel / Grado / Grupo", "Periodos adeudados", "Vencimiento más antiguo"].map((heading) => (
                  <th key={heading} scope="col" className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                    {heading}
                  </th>
                ))}
                <th scope="col" className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">Adeudo total</th>
                <th scope="col" className="px-5 py-3.5 text-center text-xs font-semibold uppercase tracking-wider text-slate-600">Recordatorio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && <TableSkeletonRows columns={6} label="Cargando cartera vencida..." />}
              {!isLoading && !error && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-sm text-slate-500">
                    No hay alumnos con saldos vencidos que coincidan con los filtros seleccionados.
                  </td>
                </tr>
              )}
              {!isLoading && !error && rows.map((row) => (
                <tr key={row.alumno_id} className="align-top transition hover:bg-slate-50">
                  <td className="whitespace-nowrap px-5 py-4">
                    <p className="text-sm font-medium text-slate-900">{getFullStudentName(row)}</p>
                    <p className="mt-1 font-mono text-[11px] text-slate-500">{row.matricula}</p>
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-sm capitalize text-slate-600">{ACADEMIC_LEVEL_LABELS[row.nivel]} · {getAcademicGradeLabel(row.nivel, row.grado)} · Grupo {row.grupo}</td>
                  <td className="min-w-72 px-5 py-4">
                    <p className="text-xs font-semibold text-slate-700">{row.cantidad_cargos} {row.cantidad_cargos === 1 ? "cargo vencido" : "cargos vencidos"}</p>
                    <ul className="mt-2 space-y-1 text-xs text-slate-600">
                      {row.cargos.map((charge) => (
                        <li key={charge.id} className="flex items-baseline justify-between gap-4">
                          <span>{charge.concepto}</span>
                          <span className="whitespace-nowrap tabular-nums">{currencyFormatter.format(charge.saldo)}</span>
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-600">{dateFormatter.format(parseDate(row.fecha_vencimiento_mas_antigua))}</td>
                  <td className="whitespace-nowrap px-5 py-4 text-right text-base font-bold tabular-nums text-red-700">{currencyFormatter.format(row.saldo_vencido)}</td>
                  <td className="whitespace-nowrap px-5 py-4 text-center">
                    <button type="button" onClick={() => void sendReminder(row)} disabled={remindingId !== null} title="Enviar recordatorio por WhatsApp" aria-label={`Enviar recordatorio a ${getFullStudentName(row)}`} className="inline-flex rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:cursor-wait disabled:opacity-50">
                      {remindingId === row.alumno_id ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Bell className="h-4 w-4" aria-hidden="true" />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <footer className="flex flex-col gap-3 border-t border-slate-200 px-5 py-4 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>{total === 0 ? "Mostrando 0 alumnos con adeudo" : `Mostrando ${(page - 1) * PAGE_SIZE + 1}-${Math.min(page * PAGE_SIZE, total)} de ${total} alumnos con adeudo`}</p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1 || isLoading} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 font-medium text-slate-700 disabled:opacity-40"><ChevronLeft className="h-4 w-4" />Anterior</button>
            <span className="min-w-16 text-center text-xs">{page} de {totalPages}</span>
            <button type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages || isLoading} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 font-medium text-slate-700 disabled:opacity-40">Siguiente<ChevronRight className="h-4 w-4" /></button>
          </div>
        </footer>
      </div>
    </section>
  );
}
