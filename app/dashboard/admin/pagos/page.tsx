"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { TableSkeletonRows } from "@/components/TableSkeletonRows";
import { getFullStudentName } from "@/lib/academic";
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

export default function PaymentsPage() {
  const [payments, setPayments] = useState<RecentPayment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadRecentPayments() {
      try {
        const data = await fetchRecentPayments();
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
  }, []);

  return (
    <section>
      <div>
        <p className="text-sm font-medium text-sky-600">Administración</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-950">
          Pagos recientes
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Últimos 20 movimientos registrados. Selecciona un alumno para
          consultar su cuenta o registrar otro pago.
        </p>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      <div className="mt-8 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                {["Fecha y hora", "Alumno", "Matrícula", "Tipo", "Periodo"].map(
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
                  columns={7}
                  label="Cargando movimientos..."
                />
              )}
              {!isLoading && !error && payments.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-6 py-12 text-center text-sm text-slate-500"
                  >
                    Todavía no se han registrado pagos.
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
