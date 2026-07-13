"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

type DashboardMetrics = {
  activeStudents: number;
  totalDebt: number;
  monthlyPayments: number;
};

const currencyFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

export default function AdminDashboardPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    activeStudents: 0,
    totalDebt: 0,
    monthlyPayments: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadMetrics() {
      try {
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

        const totalDebt = studentsResult.data.reduce(
          (total, student) =>
            total +
            student.deuda_mensualidad +
            student.deuda_inscripcion,
          0,
        );

        if (isMounted) {
          setMetrics({
            activeStudents: studentsResult.data.length,
            totalDebt,
            monthlyPayments: paymentsResult.count ?? 0,
          });
        }
      } catch (caughtError) {
        if (isMounted) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "No fue posible cargar el resumen administrativo.",
          );
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    void loadMetrics();
    return () => {
      isMounted = false;
    };
  }, []);

  const cards = [
    {
      label: "Alumnos activos",
      value: metrics.activeStudents.toLocaleString("es-MX"),
      description: "Registros con estado activo",
      accent: "border-sky-200 bg-sky-50 text-sky-950",
    },
    {
      label: "Deuda acumulada",
      value: currencyFormatter.format(metrics.totalDebt),
      description: "Mensualidad e inscripción pendientes",
      accent: "border-amber-200 bg-amber-50 text-amber-950",
    },
    {
      label: "Pagos del mes",
      value: metrics.monthlyPayments.toLocaleString("es-MX"),
      description: "Movimientos recibidos en el mes actual",
      accent: "border-emerald-200 bg-emerald-50 text-emerald-950",
    },
  ];

  return (
    <section>
      <div>
        <p className="text-sm font-medium text-sky-600">Panel administrativo</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-950">
          Resumen general
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Indicadores actuales de alumnos, adeudos y pagos.
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

      <div className="mt-8 grid gap-5 md:grid-cols-3">
        {cards.map((card) => (
          <article
            key={card.label}
            className={`rounded-xl border p-6 shadow-sm ${card.accent}`}
          >
            <p className="text-sm font-medium opacity-75">{card.label}</p>
            {isLoading ? (
              <div className="mt-3 h-9 w-28 animate-pulse rounded bg-current opacity-10" />
            ) : (
              <p className="mt-2 text-3xl font-bold tabular-nums">
                {card.value}
              </p>
            )}
            <p className="mt-3 text-xs opacity-65">{card.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
