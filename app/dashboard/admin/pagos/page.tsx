"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Download, LoaderCircle } from "lucide-react";
import { TableSkeletonRows } from "@/components/TableSkeletonRows";
import { getFullStudentName } from "@/lib/academic";
import { getPaymentMethodLabel } from "@/lib/payments";
import {
  loadRecentPayments as fetchRecentPayments,
  type RecentPayment,
} from "@/lib/admin-data";

const currencyFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

const dateFormatter = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Mexico_City",
});

const todayInMexico = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Mexico_City",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

const dayFormatter = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "full",
  timeZone: "UTC",
});

function addCalendarDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export default function PaymentsPage() {
  const [payments, setPayments] = useState<RecentPayment[]>([]);
  const [paymentsDate, setPaymentsDate] = useState(todayInMexico);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [closingDate, setClosingDate] = useState(todayInMexico);
  const [isDownloadingClosing, setIsDownloadingClosing] = useState(false);
  const [closingError, setClosingError] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadRecentPayments() {
      setIsLoading(true);
      setError(null);
      try {
        const data = await fetchRecentPayments(paymentsDate);
        if (isMounted) setPayments(data);
      } catch (caughtError) {
        if (isMounted) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "No fue posible cargar los pagos recientes.",
          );
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    void loadRecentPayments();
    return () => {
      isMounted = false;
    };
  }, [paymentsDate]);

  const isToday = paymentsDate === todayInMexico;
  const displayedDay = dayFormatter.format(
    new Date(`${paymentsDate}T12:00:00Z`),
  );

  async function downloadDailyClosing() {
    if (!closingDate) {
      setClosingError("Selecciona el día que deseas descargar.");
      return;
    }

    setIsDownloadingClosing(true);
    setClosingError("");
    try {
      const response = await fetch(
        `/api/admin/daily-closing?date=${encodeURIComponent(closingDate)}`,
        { cache: "no-store" },
      );
      if (!response.ok) {
        const result = (await response.json()) as { error?: string };
        throw new Error(result.error || "No fue posible generar el corte diario.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `corte-pagos-${closingDate}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (caughtError) {
      setClosingError(
        caughtError instanceof Error
          ? caughtError.message
          : "No fue posible generar el corte diario.",
      );
    } finally {
      setIsDownloadingClosing(false);
    }
  }

  return (
    <section className="mx-auto max-w-7xl">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium text-sky-600">Administración</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-950">
            Pagos recientes
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">
            Todos los movimientos registrados por día. Usa la navegación para
            consultar jornadas anteriores.
          </p>
        </div>
        <div className="w-full rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:w-auto">
          <p className="text-sm font-semibold text-slate-900">Corte diario</p>
          <p className="mt-1 text-xs text-slate-500">Descarga pagos y totales por método.</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <label className="sr-only" htmlFor="closing-date">Fecha del corte</label>
            <input
              id="closing-date"
              type="date"
              max={todayInMexico}
              required
              value={closingDate}
              onChange={(event) => setClosingDate(event.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            />
            <button
              type="button"
              disabled={isDownloadingClosing || !closingDate}
              onClick={() => void downloadDailyClosing()}
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isDownloadingClosing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {isDownloadingClosing ? "Generando..." : "Descargar corte CSV"}
            </button>
          </div>
          {closingError && <p role="alert" className="mt-2 max-w-sm text-xs text-red-600">{closingError}</p>}
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

      <div className="mt-8 w-full max-w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm [contain:inline-size]">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Movimientos del día</p>
            <p className="mt-1 text-sm font-semibold capitalize text-slate-950">{displayedDay}</p>
            <p className="mt-1 text-xs text-slate-500">{isLoading ? "Consultando movimientos..." : `${payments.length} ${payments.length === 1 ? "movimiento registrado" : "movimientos registrados"}`}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setPaymentsDate((date) => addCalendarDays(date, -1))} disabled={isLoading} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"><ChevronLeft className="h-4 w-4" />Día anterior</button>
            {!isToday && <button type="button" onClick={() => setPaymentsDate(todayInMexico)} disabled={isLoading} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40">Hoy</button>}
            <button type="button" onClick={() => setPaymentsDate((date) => addCalendarDays(date, 1))} disabled={isLoading || isToday} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">Día siguiente<ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="w-full max-w-full overflow-x-auto overscroll-x-contain">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                {["Fecha y hora", "Alumno", "CURP", "Tipo", "Periodo", "Método"].map(
                  (heading) => (
                    <th
                      key={heading}
                      scope="col"
                      className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-600"
                    >
                      {heading}
                    </th>
                  ),
                )}
                <th
                  scope="col"
                  className="px-6 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-600"
                >
                  Monto
                </th>
                <th scope="col" className="px-6 py-3.5">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && (
                <TableSkeletonRows
                  columns={8}
                  label="Cargando movimientos..."
                />
              )}
              {!isLoading && !error && payments.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-6 py-12 text-center text-sm text-slate-500"
                  >
                    No se registraron pagos durante este día.
                  </td>
                </tr>
              )}
              {!isLoading &&
                !error &&
                payments.map((payment) => (
                  <tr key={payment.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600">
                      {dateFormatter.format(new Date(payment.fecha_pago))}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-slate-900">
                      {getFullStudentName(payment.alumnos)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 font-mono text-sm text-slate-600">
                      {payment.alumnos.matricula ?? "Sin asignar"}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm font-medium capitalize text-slate-700">
                      {payment.tipo_pago}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm capitalize text-slate-600">
                      {payment.mes} {payment.anio}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600">
                      {getPaymentMethodLabel(payment.metodo_pago)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-semibold tabular-nums text-slate-900">
                      {currencyFormatter.format(payment.monto)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right">
                      <Link
                        href={`/dashboard/admin/alumnos/${payment.alumnos.id}`}
                        className="text-sm font-medium text-sky-600 hover:text-sky-800"
                      >
                        Ver cuenta
                      </Link>
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
