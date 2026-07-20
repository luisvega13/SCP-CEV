"use client";

import { useEffect, useState } from "react";
import { PaymentHistory } from "@/components/PaymentHistory";
import {
  ACADEMIC_MONTHS,
  getAcademicMonthYear,
  getCurrentAcademicMonthIndex,
  getCurrentAcademicCycle,
  getFullStudentName,
} from "@/lib/academic";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import {
  getDiscountedCost,
  getScholarshipScopeLabel,
  type AppliedScholarship,
} from "@/lib/scholarships";
import type {
  Alumno,
  ConfiguracionCostos,
  EstadoCuenta,
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
  const [scholarship, setScholarship] = useState<AppliedScholarship | null>(null);
  const [overdueBalance, setOverdueBalance] = useState(0);
  const [currentDate] = useState(() => new Date());
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
          const [paymentsResult, configurationResult, accountResult, scholarshipResult] = await Promise.all([
            supabase
              .from("pagos")
              .select("*")
              .eq("alumno_id", data.id)
              .eq("ciclo_escolar", cycle)
              .order("fecha_pago", { ascending: false }),
            supabase
              .from("configuracion_costos")
              .select("*")
              .eq("nivel", data.nivel)
              .eq("ciclo_escolar", cycle)
              .maybeSingle(),
            supabase
              .from("estado_cuenta")
              .select("*")
              .eq("alumno_id", data.id),
            supabase
              .from("alumnos_becas")
              .select("porcentaje_aplicado, alcance_aplicado, becas!inner(nombre)")
              .eq("alumno_id", data.id)
              .eq("ciclo_escolar", cycle)
              .maybeSingle(),
          ]);

          if (paymentsResult.error) throw paymentsResult.error;
          if (configurationResult.error) throw configurationResult.error;
          if (accountResult.error) throw accountResult.error;
          if (scholarshipResult.error) throw scholarshipResult.error;
          if (isMounted) {
            setPayments(paymentsResult.data);
            setConfiguration(configurationResult.data);
            setScholarship(scholarshipResult.data as unknown as AppliedScholarship | null);
            const charges = accountResult.data as EstadoCuenta[];
            const overdueMonthlyBalance = charges
              .filter(
                (charge) =>
                  charge.tipo_pago === "mensualidad" &&
                  charge.estatus === "vencido",
              )
              .reduce(
                (total, charge) =>
                  total + Math.max(charge.monto_esperado - charge.monto_pagado, 0),
                0,
              );
            const enrollmentCharges = charges.filter(
              (charge) => charge.tipo_pago === "inscripcion",
            );
            const pendingEnrollmentBalance = enrollmentCharges.length > 0
              ? enrollmentCharges.reduce(
                  (total, charge) =>
                    total + Math.max(charge.monto_esperado - charge.monto_pagado, 0),
                  0,
                )
              : data.deuda_inscripcion;
            setOverdueBalance(
              overdueMonthlyBalance + pendingEnrollmentBalance,
            );
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

  const currentMonthIndex = getCurrentAcademicMonthIndex(currentDate);
  const effectiveMonthlyCost = configuration
    ? getDiscountedCost(configuration.costo_mensualidad, scholarship, "mensualidad")
    : 0;
  const monthlyStatuses = ACADEMIC_MONTHS.map((month, index) => {
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
      index,
      year,
      paidAmount,
      pendingAmount: configuration
        ? Math.max(effectiveMonthlyCost - paidAmount, 0)
        : 0,
      isCurrent: index === currentMonthIndex,
      isDue: index <= currentMonthIndex,
      isPaid:
        configuration !== null &&
        paidAmount >= effectiveMonthlyCost,
    };
  });
  const currentMonth = monthlyStatuses[currentMonthIndex];
  const accruedMonthlyDebt = configuration
    ? monthlyStatuses
        .filter((month) => month.isDue)
        .reduce((total, month) => total + month.pendingAmount, 0)
    : 0;
  const accountStatusReady =
    !isPaymentsLoading && !paymentsError && configuration !== null;
  const hasOverdueBalance = accountStatusReady && overdueBalance >= 0.01;

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

      {student.estado === "pausa" && student.pausa_automatica_inscripcion && (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          <p className="font-semibold">Inscripción pendiente fuera de plazo</p>
          <p className="mt-1 leading-6">
            Tu cuenta se encuentra en pausa porque venció la fecha límite de inscripción. Comunícate con administración para liquidar el saldo y reactivar automáticamente tu estatus.
          </p>
        </div>
      )}

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
            {!accountStatusReady ? (
              <p className="text-sm font-semibold text-slate-500">
                Calculando estado...
              </p>
            ) : !hasOverdueBalance ? (
              <div className="rounded-full bg-emerald-100 px-4 py-2 text-sm font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-600/20">
                Estado: Al corriente
              </div>
            ) : (
              <div className="rounded-xl bg-amber-100 px-4 py-2 text-right text-amber-900 ring-1 ring-inset ring-amber-600/20">
                <p className="text-xs font-semibold uppercase tracking-wide">
                  Saldo vencido
                </p>
                <p className="mt-0.5 text-lg font-bold tabular-nums">
                  {currencyFormatter.format(overdueBalance)}
                </p>
              </div>
            )}
          </div>
        </div>

        {accountStatusReady && (
          <div
            className={`mt-5 rounded-xl border p-5 ${
              !hasOverdueBalance
                ? "border-emerald-200 bg-emerald-50"
                : "border-amber-200 bg-amber-50"
            }`}
          >
            <p
              className={`text-lg font-bold ${
                !hasOverdueBalance ? "text-emerald-900" : "text-amber-900"
              }`}
            >
              {!hasOverdueBalance
                ? "¡Estás al corriente!"
                : "Tienes pagos pendientes"}
            </p>
            <p
              className={`mt-1 text-sm ${
                !hasOverdueBalance ? "text-emerald-700" : "text-amber-800"
              }`}
            >
              {!hasOverdueBalance
                ? `Tus mensualidades están cubiertas hasta ${currentMonth.label} ${currentMonth.year}.`
                : `Saldo vencido más inscripción pendiente: ${currencyFormatter.format(overdueBalance)}.`}
            </p>
          </div>
        )}

        {!isPaymentsLoading && !configuration && (
          <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            No es posible calcular tu estado porque los costos del ciclo aún no están configurados.
          </p>
        )}

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
                ? `Mensualidad: ${currencyFormatter.format(effectiveMonthlyCost)}`
                : "Costos pendientes de configuración"}
            </p>
            {configuration && (
              <p className="mt-1 text-xs text-sky-700">
                Límite de inscripción: {new Intl.DateTimeFormat("es-MX", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                  timeZone: "UTC",
                }).format(new Date(`${configuration.fecha_limite_inscripcion}T12:00:00Z`))}
              </p>
            )}
          </article>
        </div>
        {scholarship && (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
            <p className="text-sm font-medium text-emerald-800">Beca aplicada</p>
            <p className="mt-1 text-lg font-bold text-emerald-950">{scholarship.becas.nombre} · {Number(scholarship.porcentaje_aplicado).toFixed(2)}%</p>
            <p className="mt-1 text-xs text-emerald-700">Aplica a {getScholarshipScopeLabel(scholarship.alcance_aplicado).toLocaleLowerCase("es-MX")} durante el ciclo {cycle}.</p>
          </div>
        )}
      </div>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-slate-950">
          Mensualidades del ciclo
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Agosto a julio · saldo hasta {currentMonth.label}:{" "}
          {accountStatusReady
            ? currencyFormatter.format(accruedMonthlyDebt)
            : "Calculando..."}
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {monthlyStatuses.map((month) => (
            <article
              key={month.value}
              className={`rounded-xl border p-4 transition ${
                month.isCurrent
                  ? "border-sky-400 bg-sky-50 ring-2 ring-sky-100"
                  : month.isPaid
                    ? "border-emerald-200 bg-emerald-50"
                    : month.isDue
                      ? "border-amber-200 bg-amber-50"
                      : "border-slate-200 bg-white"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-950">
                    {month.label} {month.year}
                  </p>
                  {month.isCurrent && (
                    <p className="mt-1 text-xs font-semibold text-sky-700">
                      Mes actual
                    </p>
                  )}
                  <p className="mt-1 text-xs text-slate-500">
                    Abonado: {currencyFormatter.format(month.paidAmount)}
                  </p>
                  {month.isDue && !month.isPaid && configuration && (
                    <p className="mt-1 text-xs font-medium text-amber-800">
                      Pendiente:{" "}
                      {currencyFormatter.format(month.pendingAmount)}
                    </p>
                  )}
                </div>
                <span
                  className={`rounded-full px-2 py-1 text-xs font-medium ${
                    month.isPaid
                      ? "bg-emerald-100 text-emerald-700"
                      : month.isDue
                        ? "bg-amber-100 text-amber-700"
                        : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {month.isPaid
                    ? "Pagado"
                    : month.isDue
                      ? "Pendiente"
                      : "Próximo"}
                </span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <PaymentHistory
        studentId={student.id}
      />
    </section>
  );
}
