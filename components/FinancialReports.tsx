"use client";

import { useEffect, useState } from "react";
import {
  Bell,
  ChartNoAxesCombined,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Download,
  TriangleAlert,
  Users,
} from "lucide-react";
import { TableSkeletonRows } from "@/components/TableSkeletonRows";
import { getFullStudentName } from "@/lib/academic";
import {
  loadFinancialReportKpis,
  loadFinancialReportPage,
  loadStudentFilterOptions,
  type FinancialAccountRow,
} from "@/lib/admin-data";
import type {
  EstatusCobro,
  FinancialReportKpis,
  StudentFilterOptions,
  TipoPago,
} from "@/types/database";

type FinancialRow = FinancialAccountRow;

type ActiveTab = "resumen" | "vencidos" | "estado-cuenta";
const PAGE_SIZE = 10;

const EMPTY_KPIS: FinancialReportKpis = {
  total_recaudado: 0,
  saldo_actual_vencido: 0,
  proyeccion_ingresos: 0,
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

const statusStyles: Record<EstatusCobro, string> = {
  pagado: "bg-emerald-100 text-emerald-800 ring-emerald-600/20",
  vencido: "bg-red-100 text-red-800 ring-red-600/20",
  parcial: "bg-amber-100 text-amber-800 ring-amber-600/20",
  pendiente: "bg-slate-100 text-slate-700 ring-slate-500/20",
};

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

function escapeCsv(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function parseDate(value: string) {
  return new Date(`${value}T00:00:00-06:00`);
}

export function FinancialReports() {
  const [rows, setRows] = useState<FinancialRow[]>([]);
  const [kpis, setKpis] = useState<FinancialReportKpis>(EMPTY_KPIS);
  const [activeTab, setActiveTab] = useState<ActiveTab>("resumen");
  const [levelFilter, setLevelFilter] = useState("todos");
  const [gradeFilter, setGradeFilter] = useState("todos");
  const [groupFilter, setGroupFilter] = useState("todos");
  const [paymentFilter, setPaymentFilter] = useState<TipoPago | "todos">(
    "todos",
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [filterOptions, setFilterOptions] = useState<StudentFilterOptions>({ grados: [], grupos: [] });

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
            overdueOnly: activeTab === "vencidos",
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
  }, [activeTab, gradeFilter, groupFilter, levelFilter, page, paymentFilter]);

  useEffect(() => {
    loadStudentFilterOptions().then(setFilterOptions).catch(() => undefined);
  }, []);

  const levels = ["primaria", "secundaria", "bachillerato"];
  const grades = filterOptions.grados.filter((grade) =>
    levelFilter === "primaria" ? grade <= 6 : grade <= 3,
  );
  const groups = filterOptions.grupos;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function exportToCsv() {
    const headers = [
      "Alumno",
      "Nivel",
      "Grado",
      "Grupo",
      "Concepto",
      "Tipo de pago",
      "Estatus",
      "Fecha límite",
      "Monto esperado",
      "Monto pagado",
      "Saldo vencido",
    ];

    const csvRows = rows.map((row) => {
      const isOverdue =
        row.estatus !== "pagado" && parseDate(row.fecha_limite) < new Date();
      const overdueBalance = isOverdue
        ? Math.max(row.monto_esperado - row.monto_pagado, 0)
        : 0;

      return [
        getFullStudentName(row.alumnos),
        row.alumnos.nivel,
        row.alumnos.grado,
        row.alumnos.grupo,
        row.concepto,
        row.tipo_pago,
        row.estatus,
        row.fecha_limite,
        row.monto_esperado,
        row.monto_pagado,
        overdueBalance,
      ];
    });

    const csv = [headers, ...csvRows]
      .map((row) => row.map(escapeCsv).join(","))
      .join("\n");
    const blob = new Blob([`\uFEFF${csv}`], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `reportes-financieros-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function sendReminder(row: FinancialRow) {
    const balance = Math.max(row.monto_esperado - row.monto_pagado, 0);
    const message = `${getFullStudentName(row.alumnos)} tiene un saldo pendiente de ${currencyFormatter.format(balance)} por ${row.concepto}, con fecha límite ${dateFormatter.format(parseDate(row.fecha_limite))}.`;

    try {
      if (navigator.share) {
        await navigator.share({ title: "Recordatorio de pago", text: message });
        setNotice("Recordatorio compartido correctamente.");
      } else {
        await navigator.clipboard.writeText(message);
        setNotice("Recordatorio copiado al portapapeles.");
      }
    } catch (caughtError) {
      if (caughtError instanceof Error && caughtError.name === "AbortError") {
        return;
      }
      setNotice("No fue posible preparar el recordatorio.");
    }
  }

  const cards = [
    {
      label: "Total Recaudado",
      value: currencyFormatter.format(kpis.total_recaudado),
      icon: CircleDollarSign,
      style: "border-emerald-200 bg-emerald-50 text-emerald-950",
    },
    {
      label: "Saldo Actual Vencido",
      value: currencyFormatter.format(kpis.saldo_actual_vencido),
      icon: TriangleAlert,
      style: "border-orange-200 bg-orange-50 text-orange-950",
    },
    {
      label: "Proyección de Ingresos",
      value: currencyFormatter.format(kpis.proyeccion_ingresos),
      icon: ChartNoAxesCombined,
      style: "border-sky-200 bg-sky-50 text-sky-950",
    },
    {
      label: "Alumnos con Adeudo",
      value: kpis.alumnos_con_adeudo.toLocaleString("es-MX"),
      icon: Users,
      style: "border-red-200 bg-red-50 text-red-950",
    },
  ];

  const tabs: Array<{ id: ActiveTab; label: string }> = [
    { id: "resumen", label: "Resumen General" },
    { id: "vencidos", label: "Por Cobrar (Vencidos)" },
    { id: "estado-cuenta", label: "Estado de Cuenta" },
  ];

  return (
    <section className="mx-auto max-w-7xl">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-sky-600">Administración</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-950">
            Reportes financieros
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Seguimiento individual de cargos, vencimientos y pagos.
          </p>
        </div>
        <button
          type="button"
          onClick={exportToCsv}
          disabled={isLoading || rows.length === 0}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Exportar a CSV
        </button>
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

      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <article key={card.label} className={`rounded-xl border p-5 shadow-sm ${card.style}`}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium opacity-75">{card.label}</p>
                <Icon className="h-5 w-5 opacity-70" aria-hidden="true" />
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

      <div className="mt-8 overflow-x-auto border-b border-slate-200" role="tablist" aria-label="Vistas del reporte">
        <div className="flex min-w-max gap-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => { setActiveTab(tab.id); setPage(1); }}
              className={`border-b-2 px-1 pb-3 text-sm font-semibold transition ${
                activeTab === tab.id
                  ? "border-sky-600 text-sky-700"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2 xl:grid-cols-4">
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
                {level}
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

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                {["Alumno", "Nivel / Grado / Grupo", "Concepto", "Estatus", "Fecha límite"].map((heading) => (
                  <th key={heading} scope="col" className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                    {heading}
                  </th>
                ))}
                <th scope="col" className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">Saldo Vencido</th>
                <th scope="col" className="px-5 py-3.5 text-center text-xs font-semibold uppercase tracking-wider text-slate-600">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && <TableSkeletonRows columns={7} label="Cargando estados de cuenta..." />}
              {!isLoading && !error && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-sm text-slate-500">
                    No hay cargos que coincidan con los filtros seleccionados.
                  </td>
                </tr>
              )}
              {!isLoading && !error && rows.map((row) => {
                const isOverdue = row.estatus !== "pagado" && parseDate(row.fecha_limite) < new Date();
                const overdueBalance = isOverdue ? Math.max(row.monto_esperado - row.monto_pagado, 0) : 0;
                const canRemind = row.estatus === "vencido" || row.estatus === "parcial";

                return (
                  <tr key={row.id} className="transition hover:bg-slate-50">
                    <td className="whitespace-nowrap px-5 py-4 text-sm font-medium text-slate-900">{getFullStudentName(row.alumnos)}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-sm capitalize text-slate-600">{row.alumnos.nivel} · {row.alumnos.grado}° · Grupo {row.alumnos.grupo}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-700">{row.concepto}</td>
                    <td className="whitespace-nowrap px-5 py-4">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ring-1 ring-inset ${statusStyles[row.estatus]}`}>{row.estatus}</span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-600">{dateFormatter.format(parseDate(row.fecha_limite))}</td>
                    <td className={`whitespace-nowrap px-5 py-4 text-right text-sm font-semibold tabular-nums ${overdueBalance > 0 ? "text-red-700" : "text-slate-500"}`}>{currencyFormatter.format(overdueBalance)}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-center">
                      {canRemind ? (
                        <button type="button" onClick={() => void sendReminder(row)} title="Enviar recordatorio" aria-label={`Enviar recordatorio a ${getFullStudentName(row.alumnos)}`} className="inline-flex rounded-lg p-2 text-slate-500 transition hover:bg-sky-50 hover:text-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500">
                          <Bell className="h-4 w-4" aria-hidden="true" />
                        </button>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <footer className="flex flex-col gap-3 border-t border-slate-200 px-5 py-4 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>{total === 0 ? "Mostrando 0 cargos" : `Mostrando ${(page - 1) * PAGE_SIZE + 1}-${Math.min(page * PAGE_SIZE, total)} de ${total} cargos`}</p>
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
