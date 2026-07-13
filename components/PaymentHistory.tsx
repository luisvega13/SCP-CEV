import type { Pago } from "@/types/database";

interface PaymentHistoryProps {
  payments: Pago[];
  isLoading: boolean;
  error?: string | null;
}

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

export function PaymentHistory({
  payments,
  isLoading,
  error,
}: PaymentHistoryProps) {
  return (
    <section className="mt-8">
      <div>
        <h2 className="text-xl font-semibold text-slate-950">
          Historial de Pagos
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Movimientos registrados del más reciente al más antiguo.
        </p>
      </div>

      <div className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th
                  scope="col"
                  className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-600"
                >
                  Fecha de Pago
                </th>
                <th
                  scope="col"
                  className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-600"
                >
                  Tipo de Pago
                </th>
                <th
                  scope="col"
                  className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-600"
                >
                  Periodo
                </th>
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
                  <td
                    colSpan={4}
                    className="px-6 py-10 text-center text-sm text-slate-500"
                  >
                    Cargando historial de pagos...
                  </td>
                </tr>
              )}

              {!isLoading && error && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-6 py-10 text-center text-sm text-red-600"
                  >
                    {error}
                  </td>
                </tr>
              )}

              {!isLoading && !error && payments.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-6 py-10 text-center text-sm text-slate-500"
                  >
                    No se han registrado pagos para este alumno.
                  </td>
                </tr>
              )}

              {!isLoading &&
                !error &&
                payments.map((payment) => (
                  <tr
                    key={payment.id}
                    className="transition-colors hover:bg-slate-50"
                  >
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600">
                      {dateFormatter.format(new Date(payment.fecha_pago))}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm font-medium capitalize text-slate-900">
                      {payment.tipo_pago}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm capitalize text-slate-600">
                      {payment.mes} {payment.anio}
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
