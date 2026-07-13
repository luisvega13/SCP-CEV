"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { getFullStudentName } from "@/lib/academic";
import type {
  Alumno,
  NivelEscolar,
  TipoPago,
} from "@/types/database";

type StudentSummary = Pick<
  Alumno,
  | "id"
  | "nombre"
  | "apellido_paterno"
  | "apellido_materno"
  | "nivel"
  | "grado"
  | "grupo"
  | "deuda_mensualidad"
  | "deuda_inscripcion"
>;

type FilterMetadata = Pick<Alumno, "nivel" | "grado" | "grupo">;

type ReportRow = StudentSummary & {
  totalPagado: number;
  totalPendiente: number;
};

type PaymentFilter = TipoPago | "todos";
type LevelFilter = NivelEscolar | "todos";

const currencyFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

const selectClass =
  "mt-2 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-700 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100";

function escapeCsv(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

export default function ReportsPage() {
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [metadata, setMetadata] = useState<FilterMetadata[]>([]);
  const [levelFilter, setLevelFilter] = useState<LevelFilter>("todos");
  const [gradeFilter, setGradeFilter] = useState("todos");
  const [groupFilter, setGroupFilter] = useState("todos");
  const [paymentFilter, setPaymentFilter] =
    useState<PaymentFilter>("todos");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadFilterMetadata() {
      const supabase = getSupabaseBrowserClient();
      const { data, error: queryError } = await supabase
        .from("alumnos")
        .select("nivel, grado, grupo");

      if (!queryError && isMounted) setMetadata(data);
    }

    void loadFilterMetadata();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isCurrentRequest = true;

    async function loadSummary() {
      setIsLoading(true);
      setError(null);

      try {
        const supabase = getSupabaseBrowserClient();
        let studentsQuery = supabase
          .from("alumnos")
          .select(
            "id, nombre, apellido_paterno, apellido_materno, nivel, grado, grupo, deuda_mensualidad, deuda_inscripcion",
          )
          .order("apellido_paterno")
          .order("apellido_materno")
          .order("nombre");

        if (levelFilter !== "todos") {
          studentsQuery = studentsQuery.eq("nivel", levelFilter);
        }
        if (gradeFilter !== "todos") {
          studentsQuery = studentsQuery.eq("grado", Number(gradeFilter));
        }
        if (groupFilter !== "todos") {
          studentsQuery = studentsQuery.eq("grupo", groupFilter);
        }

        const { data: students, error: studentsError } =
          await studentsQuery;

        if (studentsError) throw studentsError;
        if (students.length === 0) {
          if (isCurrentRequest) setRows([]);
          return;
        }

        let paymentsQuery = supabase
          .from("pagos")
          .select("alumno_id, monto")
          .in(
            "alumno_id",
            students.map((student) => student.id),
          );

        if (paymentFilter !== "todos") {
          paymentsQuery = paymentsQuery.eq("tipo_pago", paymentFilter);
        }

        const { data: payments, error: paymentsError } =
          await paymentsQuery;

        if (paymentsError) throw paymentsError;

        const paidByStudent = new Map<string, number>();
        payments.forEach((payment) => {
          paidByStudent.set(
            payment.alumno_id,
            (paidByStudent.get(payment.alumno_id) ?? 0) + payment.monto,
          );
        });

        const summary = students.map((student) => ({
          ...student,
          totalPagado: paidByStudent.get(student.id) ?? 0,
          totalPendiente:
            student.deuda_mensualidad + student.deuda_inscripcion,
        }));

        if (isCurrentRequest) setRows(summary);
      } catch (caughtError) {
        if (isCurrentRequest) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "No fue posible generar el reporte financiero.",
          );
        }
      } finally {
        if (isCurrentRequest) setIsLoading(false);
      }
    }

    void loadSummary();
    return () => {
      isCurrentRequest = false;
    };
  }, [gradeFilter, groupFilter, levelFilter, paymentFilter]);

  const availableGrades = useMemo(
    () =>
      Array.from(
        new Set(
          metadata
            .filter(
              (item) =>
                levelFilter === "todos" || item.nivel === levelFilter,
            )
            .map((item) => item.grado),
        ),
      ).sort((first, second) => first - second),
    [levelFilter, metadata],
  );

  const availableGroups = useMemo(
    () =>
      Array.from(
        new Set(
          metadata
            .filter(
              (item) =>
                (levelFilter === "todos" || item.nivel === levelFilter) &&
                (gradeFilter === "todos" ||
                  item.grado === Number(gradeFilter)),
            )
            .map((item) => item.grupo),
        ),
      ).sort((first, second) => first.localeCompare(second, "es")),
    [gradeFilter, levelFilter, metadata],
  );

  const totalFiltered = rows.reduce(
    (total, row) => total + row.totalPagado,
    0,
  );

  function exportCsv() {
    if (rows.length === 0) return;

    const data = [
      ["Nombre", "Nivel", "Grado", "Grupo", "Total Pagado", "Total Pendiente"],
      ...rows.map((row) => [
        getFullStudentName(row),
        row.nivel,
        row.grado,
        row.grupo,
        row.totalPagado.toFixed(2),
        row.totalPendiente.toFixed(2),
      ]),
    ];
    const csv = data
      .map((row) => row.map((value) => escapeCsv(value)).join(","))
      .join("\r\n");
    const blob = new Blob(["\uFEFF", csv], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `resumen-financiero-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-sky-600">Administración</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-950">
            Reportes financieros
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Resumen acumulado de pagos y adeudos por alumno.
          </p>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          disabled={isLoading || rows.length === 0}
          className="rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Exportar a CSV
        </button>
      </div>

      <div className="mt-8 grid gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <label htmlFor="reportLevel" className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Nivel
          </label>
          <select
            id="reportLevel"
            value={levelFilter}
            onChange={(event) => {
              setLevelFilter(event.target.value as LevelFilter);
              setGradeFilter("todos");
              setGroupFilter("todos");
            }}
            className={selectClass}
          >
            <option value="todos">Todos</option>
            <option value="primaria">Primaria</option>
            <option value="secundaria">Secundaria</option>
            <option value="bachillerato">Bachillerato</option>
          </select>
        </div>
        <div>
          <label htmlFor="reportGrade" className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Grado
          </label>
          <select
            id="reportGrade"
            value={gradeFilter}
            onChange={(event) => {
              setGradeFilter(event.target.value);
              setGroupFilter("todos");
            }}
            className={selectClass}
          >
            <option value="todos">Todos</option>
            {availableGrades.map((grade) => (
              <option key={grade} value={grade}>
                {grade}°
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="reportGroup" className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Grupo
          </label>
          <select
            id="reportGroup"
            value={groupFilter}
            onChange={(event) => setGroupFilter(event.target.value)}
            className={selectClass}
          >
            <option value="todos">Todos</option>
            {availableGroups.map((group) => (
              <option key={group} value={group}>
                {group}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="reportPaymentType" className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Tipo de pago
          </label>
          <select
            id="reportPaymentType"
            value={paymentFilter}
            onChange={(event) =>
              setPaymentFilter(event.target.value as PaymentFilter)
            }
            className={selectClass}
          >
            <option value="todos">Todos</option>
            <option value="inscripcion">Inscripción</option>
            <option value="mensualidad">Mensualidad</option>
          </select>
        </div>
        <div className="lg:text-right">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Total filtrado
          </p>
          <p className="mt-2 text-xl font-bold tabular-nums text-slate-950">
            {currencyFormatter.format(totalFiltered)}
          </p>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th scope="col" className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Nombre
                </th>
                <th scope="col" className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Nivel / Grado / Grupo
                </th>
                <th scope="col" className="px-6 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Total Pagado
                </th>
                <th scope="col" className="px-6 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Total Pendiente
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-sm text-slate-500">
                    Generando resumen...
                  </td>
                </tr>
              )}
              {!isLoading && !error && rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-sm text-slate-500">
                    No hay alumnos que coincidan con los filtros.
                  </td>
                </tr>
              )}
              {!isLoading &&
                !error &&
                rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-slate-900">
                      {getFullStudentName(row)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm capitalize text-slate-600">
                      {row.nivel} · {row.grado}° · Grupo {row.grupo}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-semibold tabular-nums text-emerald-700">
                      {currencyFormatter.format(row.totalPagado)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-semibold tabular-nums text-amber-800">
                      {currencyFormatter.format(row.totalPendiente)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
