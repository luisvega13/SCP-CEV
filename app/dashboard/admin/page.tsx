"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Download,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import { getPaymentMethodLabel } from "@/lib/payments";
import { getAcademicGradeLabel } from "@/lib/academic";
import {
  getScholarshipDiscountLabel,
  getScholarshipScopeLabel,
} from "@/lib/scholarships";
import {
  invalidateAdminData,
  loadDailyClosing,
  loadDashboardMetrics,
  loadMonthlyFinancialSummary,
  loadScholarshipBreakdown,
  loadStudentBreakdown,
} from "@/lib/admin-data";
import type {
  AdminDashboardOverview,
  BecadosPorTipo,
  CorteDiario,
  DesgloseAlumnos,
  NivelEscolar,
  ResumenFinancieroMensual,
} from "@/types/database";

const currencyFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat("es-MX");

const axisCurrencyFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  notation: "compact",
  maximumFractionDigits: 1,
});

const dateTimeFormatter = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Mexico_City",
});

const fullDateFormatter = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "long",
  timeZone: "America/Mexico_City",
});

const tableDateFormatter = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "America/Mexico_City",
});

const LEVEL_LABELS: Record<NivelEscolar, string> = {
  preescolar: "Preescolar",
  primaria: "Primaria",
  secundaria: "Secundaria",
  bachillerato: "Bachillerato",
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

function DownloadReportLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      download
      className="inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-sky-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700"
    >
      <Download className="h-4 w-4" aria-hidden="true" />
      Descargar reporte
    </a>
  );
}

type FinancialChartMetric = "proyectado" | "pagado" | "adeudo";

const FINANCIAL_CHART_META: Record<
  FinancialChartMetric,
  { label: string; totalLabel: string; barClassName: string }
> = {
  proyectado: {
    label: "Proyección de ingresos",
    totalLabel: "Proyección total del ciclo",
    barClassName: "bg-sky-500 group-hover:bg-sky-600",
  },
  pagado: {
    label: "Pago aplicado",
    totalLabel: "Pagado aplicado al ciclo",
    barClassName: "bg-emerald-500 group-hover:bg-emerald-600",
  },
  adeudo: {
    label: "Adeudo pendiente",
    totalLabel: "Adeudo pendiente del ciclo",
    barClassName: "bg-amber-500 group-hover:bg-amber-600",
  },
};

function FinancialCycleChart({
  summary,
}: {
  summary: ResumenFinancieroMensual;
}) {
  const [metric, setMetric] = useState<FinancialChartMetric>("proyectado");
  const meta = FINANCIAL_CHART_META[metric];
  const values = summary.meses.map((month) => Number(month[metric]) || 0);
  const maximum = Math.max(1, ...values);
  const axisMaximum = Math.ceil(maximum / 4) * 4;
  const ticks = [axisMaximum, axisMaximum * 0.75, axisMaximum * 0.5, axisMaximum * 0.25, 0];
  const total = values.reduce((sum, value) => sum + value, 0);

  return (
    <section className="mt-6 min-w-0 max-w-full overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-slate-950">
            Resumen financiero del ciclo
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Comparativo mensual de agosto a julio del ciclo {summary.ciclo_escolar}.
          </p>
        </div>
        <div className="flex max-w-full flex-col gap-3 lg:items-end">
          <DownloadReportLink
            href={`/api/admin/exports/monthly-finance?cycle=${encodeURIComponent(summary.ciclo_escolar)}`}
          />
          <div
            className="flex max-w-full gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-1"
            aria-label="Cambiar gráfica financiera"
          >
            {(Object.keys(FINANCIAL_CHART_META) as FinancialChartMetric[]).map(
              (option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={metric === option}
                  onClick={() => setMetric(option)}
                  className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition sm:text-sm ${
                    metric === option
                      ? "bg-white text-sky-700 shadow-sm ring-1 ring-slate-200"
                      : "text-slate-600 hover:text-slate-950"
                  }`}
                >
                  {FINANCIAL_CHART_META[option].label}
                </button>
              ),
            )}
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-1 border-b border-slate-100 pb-4 sm:flex-row sm:items-baseline sm:justify-between">
        <p className="text-sm font-medium text-slate-500">{meta.totalLabel}</p>
        <p className="text-2xl font-bold tabular-nums text-slate-950">
          {currencyFormatter.format(total)}
        </p>
      </div>

      <div className="mt-6 max-w-full overflow-x-auto pb-2">
        <div className="min-w-[760px]">
          <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3">
            <div className="flex h-64 flex-col justify-between pb-px text-right text-[11px] font-medium tabular-nums text-slate-400">
              {ticks.map((tick) => (
                <span key={tick}>{axisCurrencyFormatter.format(tick)}</span>
              ))}
            </div>
            <div className="relative h-64 border-b border-l border-slate-200">
              {[0, 25, 50, 75].map((position) => (
                <span
                  key={position}
                  aria-hidden="true"
                  className="absolute left-0 right-0 border-t border-dashed border-slate-200"
                  style={{ top: `${position}%` }}
                />
              ))}
              <div className="absolute inset-0 flex items-end gap-3 px-3">
                {summary.meses.map((month, index) => {
                  const value = values[index];
                  const height = value === 0 ? 1 : Math.max(3, (value / axisMaximum) * 100);
                  return (
                    <div
                      key={`${month.mes}-${month.anio}`}
                      className="group flex h-full min-w-0 flex-1 items-end justify-center"
                    >
                      <div
                        title={`${month.etiqueta} ${month.anio}: ${currencyFormatter.format(value)}`}
                        style={{ height: `${height}%` }}
                        className={`w-full max-w-12 rounded-t-md transition-colors ${meta.barClassName}`}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
            <span aria-hidden="true" />
            <div className="grid grid-cols-12 gap-3 px-3 text-center">
              {summary.meses.map((month) => (
                <div key={`${month.mes}-${month.anio}`} className="min-w-0">
                  <p className="truncate text-xs font-semibold capitalize text-slate-600">
                    {month.etiqueta.slice(0, 3)}
                  </p>
                  <p className="mt-0.5 text-[10px] text-slate-400">
                    {String(month.anio).slice(-2)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <p className="sr-only">
        {meta.label}: {summary.meses
          .map(
            (month, index) =>
              `${month.etiqueta} ${month.anio}, ${currencyFormatter.format(values[index])}`,
          )
          .join("; ")}.
      </p>
    </section>
  );
}

function DailyClosingCard({ closing }: { closing: CorteDiario }) {
  const generalRows = [
    {
      label: "Movimientos",
      withoutInvoice: numberFormatter.format(closing.movimientos_sin_factura),
      withInvoice: numberFormatter.format(closing.movimientos_con_factura),
      total: numberFormatter.format(closing.total_movimientos),
    },
    {
      label: "Recaudado (MXN)",
      withoutInvoice: currencyFormatter.format(closing.recaudado_sin_factura),
      withInvoice: currencyFormatter.format(closing.recaudado_con_factura),
      total: currencyFormatter.format(closing.total_recaudado),
    },
  ];

  return (
    <section className="mt-6 min-w-0 max-w-full overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-950">Corte diario</h2>
          <p className="mt-1 text-sm text-slate-500">
            Movimientos y recaudación del día, separados por estatus de factura.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:items-end">
          <DownloadReportLink
            href={`/api/admin/daily-closing?date=${encodeURIComponent(closing.fecha)}`}
          />
          <p className="text-sm font-semibold capitalize text-slate-700">
            {fullDateFormatter.format(new Date(`${closing.fecha}T12:00:00Z`))}
          </p>
        </div>
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-bold text-slate-900">Resumen general</h3>
        <div className="mt-3 max-w-full overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[620px] border-collapse text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Concepto</th>
                <th className="px-4 py-3 text-right">Sin factura</th>
                <th className="px-4 py-3 text-right">Con factura</th>
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {generalRows.map((row) => (
                <tr key={row.label}>
                  <th scope="row" className="px-4 py-3 text-left font-semibold text-slate-800">
                    {row.label}
                  </th>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-600">{row.withoutInvoice}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-600">{row.withInvoice}</td>
                  <td className="px-4 py-3 text-right font-bold tabular-nums text-slate-950">{row.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-7">
        <h3 className="text-sm font-bold text-slate-900">Resumen por método</h3>
        <div className="mt-3 max-w-full overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[1040px] border-collapse text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Método de pago</th>
                <th className="px-4 py-3 text-right">Mov. sin factura</th>
                <th className="px-4 py-3 text-right">Mov. con factura</th>
                <th className="px-4 py-3 text-right">Mov. totales</th>
                <th className="px-4 py-3 text-right">Recaudado sin factura</th>
                <th className="px-4 py-3 text-right">Recaudado con factura</th>
                <th className="px-4 py-3 text-right">Recaudado total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {closing.por_metodo.map((method) => (
                <tr key={method.metodo}>
                  <th scope="row" className="whitespace-nowrap px-4 py-3 text-left font-semibold text-slate-800">
                    {getPaymentMethodLabel(method.metodo)}
                  </th>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-600">{numberFormatter.format(method.movimientos_sin_factura)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-600">{numberFormatter.format(method.movimientos_con_factura)}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-800">{numberFormatter.format(method.movimientos)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-600">{currencyFormatter.format(method.recaudado_sin_factura)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-600">{currencyFormatter.format(method.recaudado_con_factura)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-bold tabular-nums text-slate-950">{currencyFormatter.format(method.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

const ACADEMIC_LEVELS: NivelEscolar[] = [
  "preescolar",
  "primaria",
  "secundaria",
  "bachillerato",
];

function StudentBreakdownCard({ report }: { report: DesgloseAlumnos }) {
  const [selectedLevel, setSelectedLevel] =
    useState<NivelEscolar>("preescolar");
  const level = report.niveles.find((item) => item.nivel === selectedLevel);

  return (
    <section className="mt-6 min-w-0 max-w-full overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-950">
            Desglose de alumnos
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Distribución del padrón por grado, sexo y estado académico en el ciclo {report.ciclo_escolar}.
          </p>
        </div>
        <div className="flex max-w-full flex-col gap-3 lg:items-end">
          <DownloadReportLink
            href={`/api/admin/exports/student-breakdown?cycle=${encodeURIComponent(report.ciclo_escolar)}`}
          />
          <div
            className="flex max-w-full gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-1"
            aria-label="Cambiar nivel del desglose"
          >
            {ACADEMIC_LEVELS.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={selectedLevel === option}
                onClick={() => setSelectedLevel(option)}
                className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition sm:text-sm ${
                  selectedLevel === option
                    ? "bg-white text-sky-700 shadow-sm ring-1 ring-slate-200"
                    : "text-slate-600 hover:text-slate-950"
                }`}
              >
                {LEVEL_LABELS[option]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 max-w-full overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[820px] border-collapse text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Nivel</th>
              <th className="px-4 py-3">Grado / semestre</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3 text-right">Hombres</th>
              <th className="px-4 py-3 text-right">Mujeres</th>
              <th className="px-4 py-3 text-right">Activos</th>
              <th className="px-4 py-3 text-right">En pausa</th>
              <th className="px-4 py-3 text-right">Bajas</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {level?.grados.map((grade) => (
              <tr key={grade.grado}>
                <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-700">
                  {LEVEL_LABELS[selectedLevel]}
                </td>
                <th scope="row" className="whitespace-nowrap px-4 py-3 text-left font-semibold text-slate-800">
                  {getAcademicGradeLabel(selectedLevel, grade.grado)}
                </th>
                <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-950">{numberFormatter.format(grade.total)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-600">{numberFormatter.format(grade.hombres)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-600">{numberFormatter.format(grade.mujeres)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-600">{numberFormatter.format(grade.activos)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-600">{numberFormatter.format(grade.pausas)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-600">{numberFormatter.format(grade.bajas)}</td>
              </tr>
            ))}
            {level && (
              <tr className="bg-slate-50/70">
                <th scope="row" className="whitespace-nowrap px-4 py-3 text-left font-bold text-slate-950">
                  {LEVEL_LABELS[level.nivel]}
                </th>
                <td className="whitespace-nowrap px-4 py-3 font-bold text-slate-950">Total del nivel</td>
                <td className="px-4 py-3 text-right font-bold tabular-nums text-slate-950">{numberFormatter.format(level.total)}</td>
                <td className="px-4 py-3 text-right font-bold tabular-nums text-slate-950">{numberFormatter.format(level.hombres)}</td>
                <td className="px-4 py-3 text-right font-bold tabular-nums text-slate-950">{numberFormatter.format(level.mujeres)}</td>
                <td className="px-4 py-3 text-right font-bold tabular-nums text-slate-950">{numberFormatter.format(level.activos)}</td>
                <td className="px-4 py-3 text-right font-bold tabular-nums text-slate-950">{numberFormatter.format(level.pausas)}</td>
                <td className="px-4 py-3 text-right font-bold tabular-nums text-slate-950">{numberFormatter.format(level.bajas)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const SCHOLARSHIP_ROWS_PER_PAGE = 5;

function ScholarshipBreakdownCard({ report }: { report: BecadosPorTipo }) {
  const [selectedScholarshipId, setSelectedScholarshipId] = useState(
    report.tipos[0]?.beca_id ?? "",
  );
  const [page, setPage] = useState(1);
  const scholarship =
    report.tipos.find((item) => item.beca_id === selectedScholarshipId) ??
    report.tipos[0];
  const totalPages = Math.max(
    1,
    Math.ceil((scholarship?.alumnos.length ?? 0) / SCHOLARSHIP_ROWS_PER_PAGE),
  );
  const currentPage = Math.min(page, totalPages);
  const visibleStudents =
    scholarship?.alumnos.slice(
      (currentPage - 1) * SCHOLARSHIP_ROWS_PER_PAGE,
      currentPage * SCHOLARSHIP_ROWS_PER_PAGE,
    ) ?? [];

  return (
    <section className="mt-6 min-w-0 max-w-full overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-950">Alumnos becados</h2>
          <p className="mt-1 text-sm text-slate-500">
            Alumnos agrupados por tipo de beca en el ciclo {report.ciclo_escolar} · {numberFormatter.format(report.total_becados)} becados en total.
          </p>
        </div>
        <div className="flex max-w-full flex-col gap-3 lg:items-end">
          <DownloadReportLink
            href={`/api/admin/exports/scholarship-students?cycle=${encodeURIComponent(report.ciclo_escolar)}`}
          />
          {report.tipos.length > 0 && (
          <div
            className="flex max-w-full gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-1"
            aria-label="Cambiar tipo de beca"
          >
            {report.tipos.map((type) => (
              <button
                key={type.beca_id}
                type="button"
                aria-pressed={scholarship?.beca_id === type.beca_id}
                onClick={() => {
                  setSelectedScholarshipId(type.beca_id);
                  setPage(1);
                }}
                className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition sm:text-sm ${
                  scholarship?.beca_id === type.beca_id
                    ? "bg-white text-sky-700 shadow-sm ring-1 ring-slate-200"
                    : "text-slate-600 hover:text-slate-950"
                }`}
              >
                {type.tipo_beca}
              </button>
            ))}
          </div>
          )}
        </div>
      </div>

      {scholarship ? (
        <>
          <div className="mt-6 max-w-full overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[1320px] border-collapse text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Nombre</th>
                  <th className="px-4 py-3">CURP</th>
                  <th className="px-4 py-3">Nivel</th>
                  <th className="px-4 py-3">Grado / semestre</th>
                  <th className="px-4 py-3">Grupo</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Tipo de descuento</th>
                  <th className="px-4 py-3">Descuento</th>
                  <th className="px-4 py-3">Aplica a</th>
                  <th className="px-4 py-3">Descuento desde</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleStudents.map((student) => (
                  <tr key={`${student.curp}-${student.vigencia_desde}`}>
                    <th scope="row" className="whitespace-nowrap px-4 py-3 text-left font-semibold text-slate-900">{student.nombre}</th>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-600">{student.curp}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{LEVEL_LABELS[student.nivel]}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{getAcademicGradeLabel(student.nivel, student.grado)}</td>
                    <td className="px-4 py-3 text-slate-600">{student.grupo}</td>
                    <td className="whitespace-nowrap px-4 py-3 capitalize text-slate-600">{student.estado === "pausa" ? "En pausa" : student.estado}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{student.tipo_descuento === "monto_fijo" ? "Monto fijo" : "Porcentaje"}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold tabular-nums text-slate-900">{getScholarshipDiscountLabel(student)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{getScholarshipScopeLabel(student.alcance)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{tableDateFormatter.format(new Date(`${student.vigencia_desde}T12:00:00Z`))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-slate-200 bg-slate-50/70">
                <tr>
                  <th colSpan={9} scope="row" className="px-4 py-3 text-left font-bold text-slate-950">Subtotal de {scholarship.tipo_beca}</th>
                  <td className="px-4 py-3 text-right font-bold tabular-nums text-slate-950">{numberFormatter.format(scholarship.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="mt-4 flex flex-col gap-3 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <p>
              {scholarship.total === 0
                ? "Sin alumnos en esta beca"
                : `Mostrando ${(currentPage - 1) * SCHOLARSHIP_ROWS_PER_PAGE + 1}-${Math.min(currentPage * SCHOLARSHIP_ROWS_PER_PAGE, scholarship.total)} de ${scholarship.total} alumnos`}
            </p>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button type="button" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">Anterior</button>
                <span className="min-w-14 text-center text-xs font-medium">{currentPage} de {totalPages}</span>
                <button type="button" disabled={currentPage === totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">Siguiente</button>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="mt-6 rounded-xl border border-dashed border-slate-300 px-5 py-10 text-center text-sm text-slate-500">
          No hay alumnos con beca asignada en este ciclo escolar.
        </div>
      )}
    </section>
  );
}

export default function AdminDashboardPage() {
  const [overview, setOverview] = useState<AdminDashboardOverview | null>(null);
  const [monthlySummary, setMonthlySummary] =
    useState<ResumenFinancieroMensual | null>(null);
  const [dailyClosing, setDailyClosing] = useState<CorteDiario | null>(null);
  const [studentBreakdown, setStudentBreakdown] =
    useState<DesgloseAlumnos | null>(null);
  const [scholarshipBreakdown, setScholarshipBreakdown] =
    useState<BecadosPorTipo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadOverview = useCallback(async (forceRefresh = false) => {
    setIsLoading(true);
    setError("");
    try {
      if (forceRefresh) {
        invalidateAdminData("dashboard:");
        invalidateAdminData("reports:monthly-summary:");
      }
      const [
        overviewData,
        monthlySummaryData,
        dailyClosingData,
        studentBreakdownData,
        scholarshipBreakdownData,
      ] = await Promise.all([
        loadDashboardMetrics(),
        loadMonthlyFinancialSummary(),
        loadDailyClosing(),
        loadStudentBreakdown(),
        loadScholarshipBreakdown(),
      ]);
      setOverview(overviewData);
      setMonthlySummary(monthlySummaryData);
      setDailyClosing(dailyClosingData);
      setStudentBreakdown(studentBreakdownData);
      setScholarshipBreakdown(scholarshipBreakdownData);
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  return (
    <section className="mx-auto w-full min-w-0 max-w-[1600px] pb-12">
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
          <button type="button" onClick={() => void loadOverview(true)} disabled={isLoading} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">
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

      {monthlySummary && <FinancialCycleChart summary={monthlySummary} />}

      {dailyClosing && <DailyClosingCard closing={dailyClosing} />}

      {studentBreakdown && <StudentBreakdownCard report={studentBreakdown} />}

      {scholarshipBreakdown && (
        <ScholarshipBreakdownCard report={scholarshipBreakdown} />
      )}

      {isLoading && !monthlySummary && (
        <div className="mt-6 flex min-h-72 items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm text-slate-500">
          <LoaderCircle className="mr-2 h-5 w-5 animate-spin" />Preparando indicadores...
        </div>
      )}
    </section>
  );
}
