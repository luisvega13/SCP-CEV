"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import type {
  Alumno,
  NivelEscolar,
  Pago,
  TipoPago,
} from "@/types/database";

type ReportPayment = Pick<
  Pago,
  "id" | "monto" | "tipo_pago" | "fecha_pago"
> & {
  alumnos: Pick<Alumno, "nombre" | "nivel">;
};

type PaymentFilter = TipoPago | "todos";
type LevelFilter = NivelEscolar | "todos";

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
  "rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-700 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100";

function escapeCsv(value: string | number) {
  const text = String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export default function ReportsPage() {
  const [payments, setPayments] = useState<ReportPayment[]>([]);
  const [paymentFilter, setPaymentFilter] =
    useState<PaymentFilter>("todos");
  const [levelFilter, setLevelFilter] = useState<LevelFilter>("todos");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadReport() {
      try {
        const supabase = getSupabaseBrowserClient();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);

        const { data, error: queryError } = await supabase
          .from("pagos")
          .select(
            "id, monto, tipo_pago, fecha_pago, alumnos!inner(nombre, nivel)",
          )
          .gte("fecha_pago", startDate.toISOString())
          .order("fecha_pago", { ascending: false });

        if (queryError) throw queryError;
        if (isMounted) setPayments(data);
      } catch (caughtError) {
        if (isMounted) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "No fue posible cargar el reporte financiero.",
          );
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    void loadReport();
    return () => {
      isMounted = false;
    };
  }, []);

  const filteredPayments = useMemo(
    () =>
      payments.filter(
        (payment) =>
          (paymentFilter === "todos" ||
            payment.tipo_pago === paymentFilter) &&
          (levelFilter === "todos" ||
            payment.alumnos.nivel === levelFilter),
      ),
    [levelFilter, paymentFilter, payments],
  );

  const filteredTotal = filteredPayments.reduce(
    (total, payment) => total + payment.monto,
    0,
  );

  function exportCsv() {
    if (filteredPayments.length === 0) return;

    const rows = [
      ["Fecha de Pago", "Alumno", "Nivel", "Tipo de Pago", "Monto"],
      ...filteredPayments.map((payment) => [
        dateFormatter.format(new Date(payment.fecha_pago)),
        payment.alumnos.nombre,
        payment.alumnos.nivel,
        payment.tipo_pago,
        payment.monto.toFixed(2),
      ]),
    ];

    const csv = rows
      .map((row) => row.map((value) => escapeCsv(value)).join(","))
      .join("\r\n");
    const blob = new Blob(["\uFEFF", csv], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `reporte-pagos-${new Date().toISOString().slice(0, 10)}.csv`;
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
            Pagos registrados durante los últimos 30 días.
          </p>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          disabled={isLoading || filteredPayments.length === 0}
          className="rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Exportar a CSV
        </button>
      </div>

      <div className="mt-8 flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-end">
        <div>
          <label
            htmlFor="paymentFilter"
            className="block text-xs font-semibold uppercase tracking-wider text-slate-500"
          >
            Tipo de pago
          </label>
          <select
            id="paymentFilter"
            value={paymentFilter}
            onChange={(event) =>
              setPaymentFilter(event.target.value as PaymentFilter)
            }
            className={`mt-2 ${selectClass}`}
          >
            <option value="todos">Todos</option>
            <option value="inscripcion">Inscripción</option>
            <option value="mensualidad">Mensualidad</option>
          </select>
        </div>
        <div>
          <label
            htmlFor="levelFilter"
            className="block text-xs font-semibold uppercase tracking-wider text-slate-500"
          >
            Nivel escolar
          </label>
          <select
            id="levelFilter"
            value={levelFilter}
            onChange={(event) =>
              setLevelFilter(event.target.value as LevelFilter)
            }
            className={`mt-2 ${selectClass}`}
          >
            <option value="todos">Todos</option>
            <option value="primaria">Primaria</option>
            <option value="secundaria">Secundaria</option>
            <option value="bachillerato">Bachillerato</option>
          </select>
        </div>
        <div className="sm:ml-auto sm:text-right">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Total filtrado
          </p>
          <p className="mt-2 text-xl font-bold tabular-nums text-slate-950">
            {currencyFormatter.format(filteredTotal)}
          </p>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                {["Fecha", "Alumno", "Nivel", "Tipo de Pago"].map((heading) => (
                  <th
                    key={heading}
                    scope="col"
                    className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-600"
                  >
                    {heading}
                  </th>
                ))}
                <th
                  scope="col"
                  className="px-6 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-600"
                >
                  Monto
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-sm text-slate-500">
                    Cargando reporte...
                  </td>
                </tr>
              )}
              {!isLoading && !error && filteredPayments.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-sm text-slate-500">
                    No hay pagos que coincidan con los filtros seleccionados.
                  </td>
                </tr>
              )}
              {!isLoading &&
                !error &&
                filteredPayments.map((payment) => (
                  <tr key={payment.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600">
                      {dateFormatter.format(new Date(payment.fecha_pago))}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-slate-900">
                      {payment.alumnos.nombre}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm capitalize text-slate-600">
                      {payment.alumnos.nivel}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm font-medium capitalize text-slate-700">
                      {payment.tipo_pago}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-semibold tabular-nums text-slate-900">
                      {currencyFormatter.format(payment.monto)}
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
