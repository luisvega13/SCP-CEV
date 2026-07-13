"use client";

import { useEffect, useState } from "react";
import { PaymentHistory } from "@/components/PaymentHistory";
import {
  ACADEMIC_MONTHS,
  getAcademicMonthYear,
  getCurrentAcademicCycle,
  getFullStudentName,
} from "@/lib/academic";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import type {
  Alumno,
  ConfiguracionCostos,
  Pago,
} from "@/types/database";

const currencyFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

export default function StudentDashboardPage() {
  const [student, setStudent] = useState<Alumno | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payments, setPayments] = useState<Pago[]>([]);
  const [isPaymentsLoading, setIsPaymentsLoading] = useState(true);
  const [paymentsError, setPaymentsError] = useState<string | null>(null);
  const [configuration, setConfiguration] =
    useState<ConfiguracionCostos | null>(null);
  const [cycle] = useState(getCurrentAcademicCycle);

  useEffect(() => {
    let isMounted = true;

    async function loadStudent() {
      try {
        const supabase = getSupabaseBrowserClient();
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) throw userError;
        if (!user) throw new Error("No se encontró una sesión activa.");

        const { data, error: queryError } = await supabase
          .from("alumnos")
          .select("*")
          .eq("usuario_id", user.id)
          .maybeSingle();

        if (queryError) throw queryError;
        if (!data) {
          throw new Error(
            "Tu cuenta no tiene un registro de alumno asociado. Contacta a la administración.",
          );
        }

        if (isMounted) {
          setStudent(data);
          setIsLoading(false);
        }

        try {
          const [paymentsResult, configurationResult] = await Promise.all([
            supabase
              .from("pagos")
              .select("*")
              .eq("alumno_id", data.id)
              .order("fecha_pago", { ascending: false }),
            supabase
              .from("configuracion_costos")
              .select("*")
              .eq("nivel", data.nivel)
              .eq("ciclo_escolar", cycle)
              .maybeSingle(),
          ]);

          if (paymentsResult.error) throw paymentsResult.error;
          if (configurationResult.error) throw configurationResult.error;
          if (isMounted) {
            setPayments(paymentsResult.data);
            setConfiguration(configurationResult.data);
          }
        } catch (paymentsCaughtError) {
          if (isMounted) {
            setPaymentsError(
              paymentsCaughtError instanceof Error
                ? paymentsCaughtError.message
                : "No fue posible cargar el historial de pagos.",
            );
          }
        }
      } catch (caughtError) {
        if (isMounted) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "No fue posible cargar tu información.",
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
          setIsPaymentsLoading(false);
        }
      }
    }

    void loadStudent();

    return () => {
      isMounted = false;
    };
  }, [cycle]);

  if (isLoading) {
    return (
      <section className="mx-auto max-w-5xl" aria-busy="true">
        <div className="h-4 w-24 animate-pulse rounded bg-slate-200" />
        <div className="mt-3 h-9 w-72 max-w-full animate-pulse rounded bg-slate-200" />
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="h-36 animate-pulse rounded-xl bg-slate-200" />
          <div className="h-36 animate-pulse rounded-xl bg-slate-200" />
        </div>
      </section>
    );
  }

  if (error || !student) {
    return (
      <section className="mx-auto max-w-3xl rounded-xl border border-red-200 bg-red-50 p-6">
        <h1 className="text-lg font-semibold text-red-900">
          No fue posible mostrar tu cuenta
        </h1>
        <p className="mt-2 text-sm leading-6 text-red-700">{error}</p>
      </section>
    );
  }

  const totalDebt =
    student.deuda_mensualidad + student.deuda_inscripcion;
  const monthlyStatuses = ACADEMIC_MONTHS.map((month) => {
    const year = getAcademicMonthYear(month.value, cycle);
    const paidAmount = payments
      .filter(
        (payment) =>
          payment.tipo_pago === "mensualidad" &&
          payment.mes === month.value &&
          payment.anio === year,
      )
      .reduce((total, payment) => total + payment.monto, 0);

    return {
      ...month,
      year,
      paidAmount,
      isPaid:
        configuration !== null &&
        paidAmount >= configuration.costo_mensualidad,
    };
  });

  return (
    <section className="mx-auto max-w-5xl">
      <div>
        <p className="text-sm font-medium text-sky-600">Mi cuenta</p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold text-slate-950">
            {getFullStudentName(student)}
          </h1>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ring-1 ring-inset ${
              student.estado === "activo"
                ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                : "bg-red-50 text-red-700 ring-red-600/20"
            }`}
          >
            {student.estado}
          </span>
        </div>
        <p className="mt-2 text-sm text-slate-500">
          Consulta tu información académica y tus saldos pendientes.
        </p>
      </div>

      <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h2 className="text-lg font-semibold text-slate-950">
          Información académica
        </h2>
        <dl className="mt-6 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Nombre
            </dt>
            <dd className="mt-2 text-sm font-medium text-slate-900">
              {getFullStudentName(student)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Matrícula
            </dt>
            <dd className="mt-2 font-mono text-sm font-semibold text-slate-900">
              {student.matricula ?? "Sin asignar"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Nivel
            </dt>
            <dd className="mt-2 text-sm font-medium capitalize text-slate-900">
              {student.nivel}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Grado
            </dt>
            <dd className="mt-2 text-sm font-medium text-slate-900">
              {student.grado}°
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Grupo
            </dt>
            <dd className="mt-2 text-sm font-medium uppercase text-slate-900">
              {student.grupo}
            </dd>
          </div>
        </dl>
      </div>

      <div className="mt-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">
              Estado de cuenta
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Saldos pendientes registrados en tu cuenta.
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Deuda total
            </p>
            <p className="mt-1 text-xl font-bold tabular-nums text-slate-950">
              {currencyFormatter.format(totalDebt)}
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <article className="rounded-xl border border-violet-200 bg-violet-50 p-6">
            <p className="text-sm font-medium text-violet-800">
              Deuda de inscripción
            </p>
            <p className="mt-2 text-3xl font-bold tabular-nums text-violet-950">
              {currencyFormatter.format(student.deuda_inscripcion)}
            </p>
          </article>
          <article className="rounded-xl border border-sky-200 bg-sky-50 p-6">
            <p className="text-sm font-medium text-sky-800">
              Ciclo escolar
            </p>
            <p className="mt-2 text-3xl font-bold text-sky-950">{cycle}</p>
            <p className="mt-2 text-xs text-sky-700">
              {configuration
                ? `Mensualidad: ${currencyFormatter.format(configuration.costo_mensualidad)}`
                : "Costos pendientes de configuración"}
            </p>
          </article>
        </div>
      </div>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-slate-950">
          Mensualidades del ciclo
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Agosto a julio · saldo pendiente:{" "}
          {currencyFormatter.format(student.deuda_mensualidad)}
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {monthlyStatuses.map((month) => (
            <article
              key={month.value}
              className={`rounded-xl border p-4 ${
                month.isPaid
                  ? "border-emerald-200 bg-emerald-50"
                  : "border-slate-200 bg-white"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-950">
                    {month.label} {month.year}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Abonado: {currencyFormatter.format(month.paidAmount)}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-1 text-xs font-medium ${
                    month.isPaid
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {month.isPaid ? "Pagado" : "Pendiente"}
                </span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <PaymentHistory
        payments={payments}
        isLoading={isPaymentsLoading}
        error={paymentsError}
      />
    </section>
  );
}
