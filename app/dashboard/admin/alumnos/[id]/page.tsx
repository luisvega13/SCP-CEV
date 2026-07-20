"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PaymentHistory } from "@/components/PaymentHistory";
import { invalidateAdminData } from "@/lib/admin-data";
import {
  ACADEMIC_MONTHS,
  getAcademicMonthYear,
  getCurrentAcademicCycle,
  getFullStudentName,
  getReEnrollmentLevel,
} from "@/lib/academic";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { PAYMENT_METHOD_OPTIONS } from "@/lib/payments";
import {
  getDiscountedCost,
  getScholarshipScopeLabel,
  scholarshipAppliesTo,
  type AppliedScholarship,
} from "@/lib/scholarships";
import type {
  Alumno,
  ConfiguracionCostos,
  MetodoPago,
  Pago,
} from "@/types/database";

const currencyFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

const fieldClass =
  "mt-2 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100";

function getErrorMessage(caughtError: unknown, fallback: string) {
  if (
    caughtError &&
    typeof caughtError === "object" &&
    "message" in caughtError &&
    typeof caughtError.message === "string"
  ) {
    return caughtError.message;
  }

  return fallback;
}

function createAcademicCycle(startYear: number) {
  return `${startYear}-${startYear + 1}`;
}

export default function StudentDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const studentId = params.id;
  const currentAcademicCycle = getCurrentAcademicCycle();
  const [student, setStudent] = useState<Alumno | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<MetodoPago>("efectivo");
  const [cycle, setCycle] = useState(currentAcademicCycle);
  const [configuration, setConfiguration] =
    useState<ConfiguracionCostos | null>(null);
  const [configurationError, setConfigurationError] = useState("");
  const [scholarship, setScholarship] = useState<AppliedScholarship | null>(null);
  const [formError, setFormError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [payments, setPayments] = useState<Pago[]>([]);
  const [isPaymentsLoading, setIsPaymentsLoading] = useState(true);
  const [paymentDataVersion, setPaymentDataVersion] = useState(0);
  const [paymentsError, setPaymentsError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(
    () => searchParams.get("editar") === "1",
  );
  const [editName, setEditName] = useState("");
  const [editPaternalSurname, setEditPaternalSurname] = useState("");
  const [editMaternalSurname, setEditMaternalSurname] = useState("");
  const [editLevel, setEditLevel] = useState<Alumno["nivel"]>("primaria");
  const [editGrade, setEditGrade] = useState("1");
  const [editGroup, setEditGroup] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [profileError, setProfileError] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadStudent() {
      try {
        const supabase = getSupabaseBrowserClient();
        const { data, error: queryError } = await supabase
          .from("alumnos")
          .select("*")
          .eq("id", studentId)
          .maybeSingle();

        if (queryError) throw queryError;

        if (isMounted) {
          setStudent(data);
          if (data) {
            setEditName(data.nombre);
            setEditPaternalSurname(data.apellido_paterno);
            setEditMaternalSurname(data.apellido_materno);
            setEditLevel(data.nivel);
            setEditGrade(String(data.grado));
            setEditGroup(data.grupo);
          }
          if (!data) setError("No se encontró el alumno solicitado.");
        }
      } catch (caughtError) {
        if (isMounted) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "No fue posible cargar la información del alumno.",
          );
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    async function loadPayments() {
      try {
        const supabase = getSupabaseBrowserClient();
        const { data, error: queryError } = await supabase
          .from("pagos")
          .select("*")
          .eq("alumno_id", studentId)
          .eq("ciclo_escolar", cycle)
          .order("fecha_pago", { ascending: false });

        if (queryError) throw queryError;
        if (isMounted) setPayments(data);
      } catch (caughtError) {
        if (isMounted) {
          setPaymentsError(
            caughtError instanceof Error
              ? caughtError.message
              : "No fue posible cargar el historial de pagos.",
          );
        }
      } finally {
        if (isMounted) setIsPaymentsLoading(false);
      }
    }

    void loadStudent();
    void loadPayments();

    return () => {
      isMounted = false;
    };
  }, [cycle, paymentDataVersion, studentId]);

  useEffect(() => {
    let isMounted = true;

    async function loadConfiguration() {
      if (!student) return;
      const billingLevel = getReEnrollmentLevel(student, cycle);

      const supabase = getSupabaseBrowserClient();
      const [configurationResult, scholarshipResult] = await Promise.all([
        supabase
          .from("configuracion_costos")
          .select("*")
          .eq("nivel", billingLevel)
          .eq("ciclo_escolar", cycle)
          .maybeSingle(),
        supabase
          .from("alumnos_becas")
          .select("porcentaje_aplicado, alcance_aplicado, becas!inner(nombre)")
          .eq("alumno_id", student.id)
          .eq("ciclo_escolar", cycle)
          .maybeSingle(),
      ]);

      if (!isMounted) return;

      if (scholarshipResult.error) {
        setConfigurationError(scholarshipResult.error.message);
        setScholarship(null);
        return;
      }
      setScholarship(scholarshipResult.data as unknown as AppliedScholarship | null);

      if (configurationResult.error) {
        setConfigurationError(configurationResult.error.message);
        setConfiguration(null);
      } else if (!configurationResult.data) {
        setConfigurationError(
          `No hay costos configurados para ${billingLevel} en ${cycle}.`,
        );
        setConfiguration(null);
      } else {
        setConfiguration(configurationResult.data);
        setConfigurationError("");
      }
    }

    void loadConfiguration();
    return () => {
      isMounted = false;
    };
  }, [cycle, student]);

  function moveCycle(direction: -1 | 1) {
    const startYear = Number(cycle.split("-")[0]);
    setCycle(createAcademicCycle(startYear + direction));
    setPayments([]);
    setIsPaymentsLoading(true);
    setPaymentsError("");
    setConfiguration(null);
    setScholarship(null);
    setConfigurationError("");
    setFormError("");
    setSuccessMessage("");
    setAmount("");
  }

  function handlePaymentUpdated() {
    invalidateAdminData("dashboard:");
    invalidateAdminData("payments:");
    invalidateAdminData("reports:");
    setIsPaymentsLoading(true);
    setPaymentDataVersion((current) => current + 1);
  }

  function beginEditing() {
    if (!student) return;
    setEditName(student.nombre);
    setEditPaternalSurname(student.apellido_paterno);
    setEditMaternalSurname(student.apellido_materno);
    setEditLevel(student.nivel);
    setEditGrade(String(student.grado));
    setEditGroup(student.grupo);
    setProfileError("");
    setProfileMessage("");
    setIsEditing(true);
  }

  async function handleUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedName = editName.trim().replace(/\s+/g, " ");
    const normalizedPaternalSurname = editPaternalSurname
      .trim()
      .replace(/\s+/g, " ");
    const normalizedMaternalSurname = editMaternalSurname
      .trim()
      .replace(/\s+/g, " ");
    const normalizedGroup = editGroup.trim().toUpperCase();
    const numericGrade = Number(editGrade);
    const maximumGrade = editLevel === "primaria" ? 6 : 3;

    setProfileError("");
    setProfileMessage("");

    if (!normalizedName || !normalizedPaternalSurname || !normalizedGroup) {
      setProfileError(
        "Nombre, apellido paterno y grupo son campos obligatorios.",
      );
      return;
    }

    if (
      !Number.isInteger(numericGrade) ||
      numericGrade < 1 ||
      numericGrade > maximumGrade
    ) {
      setProfileError("Selecciona un grado válido para el nivel indicado.");
      return;
    }

    setIsUpdating(true);

    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error: updateError } = await supabase
        .from("alumnos")
        .update({
          nombre: normalizedName,
          apellido_paterno: normalizedPaternalSurname,
          apellido_materno: normalizedMaternalSurname,
          nivel: editLevel,
          grado: numericGrade,
          grupo: normalizedGroup,
        })
        .eq("id", studentId)
        .select("*")
        .single();

      if (updateError) throw updateError;

      invalidateAdminData("students:");
      invalidateAdminData("reports:");
      setStudent(data);
      setIsEditing(false);
      setProfileMessage("La información académica se actualizó correctamente.");
    } catch (caughtError) {
      setProfileError(
        caughtError instanceof Error
          ? caughtError.message
          : "No fue posible actualizar al alumno.",
      );
    } finally {
      setIsUpdating(false);
    }
  }

  async function handleStatusChange(nextStatus: Alumno["estado"]) {
    if (!student) return;
    if (nextStatus === student.estado) return;

    setProfileError("");
    setProfileMessage("");
    setIsUpdatingStatus(true);

    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error: updateError } = await supabase
        .from("alumnos")
        .update({ estado: nextStatus })
        .eq("id", studentId)
        .select("*")
        .single();

      if (updateError) throw updateError;

      invalidateAdminData("students:");
      invalidateAdminData("dashboard:");
      invalidateAdminData("reports:");
      setStudent(data);
      const statusMessages: Record<Alumno["estado"], string> = {
        activo: "El alumno fue reactivado correctamente.",
        pausa: "El alumno quedó en pausa temporal.",
        baja: "El alumno fue dado de baja correctamente.",
      };
      setProfileMessage(statusMessages[nextStatus]);
    } catch (caughtError) {
      setProfileError(
        caughtError instanceof Error
          ? caughtError.message
          : "No fue posible cambiar el estado del alumno.",
      );
    } finally {
      setIsUpdatingStatus(false);
    }
  }

  async function handlePaymentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const numericAmount = Number(amount);
    setSuccessMessage("");

    if (!configuration) {
      setFormError("Configura los costos del nivel y ciclo antes de registrar pagos.");
      return;
    }

    if (!activePaymentType || !activeMonth || !activeYear) {
      setFormError("El ciclo escolar ya se encuentra liquidado.");
      return;
    }

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setFormError("Ingresa un monto mayor a cero.");
      return;
    }

    if (numericAmount > activePendingAmount) {
      setFormError(
        `El monto no puede superar el saldo pendiente de ${currencyFormatter.format(activePendingAmount)}.`,
      );
      return;
    }

    setFormError("");
    setPaymentsError(null);
    setIsSaving(true);

    try {
      const supabase = getSupabaseBrowserClient();
      const { error: insertError } = await supabase.from("pagos").insert({
        alumno_id: studentId,
        monto: numericAmount,
        tipo_pago: activePaymentType,
        metodo_pago: paymentMethod,
        mes: activeMonth,
        anio: activeYear,
      });

      if (insertError) throw insertError;

      invalidateAdminData("payments:");
      invalidateAdminData("dashboard:");
      invalidateAdminData("reports:");
      setIsPaymentsLoading(true);
      const [studentResult, paymentsResult] = await Promise.all([
        supabase.from("alumnos").select("*").eq("id", studentId).single(),
        supabase
          .from("pagos")
          .select("*")
          .eq("alumno_id", studentId)
          .eq("ciclo_escolar", cycle)
          .order("fecha_pago", { ascending: false }),
      ]);

      if (studentResult.error) {
        setFormError(
          "El pago se guardó, pero no fue posible actualizar el saldo en pantalla.",
        );
      } else {
        setStudent(studentResult.data);
      }

      if (paymentsResult.error) {
        setPaymentsError(
          "El pago se guardó, pero no fue posible actualizar el historial.",
        );
      } else {
        setPayments(paymentsResult.data);
      }

      setAmount("");
      setSuccessMessage("El pago se registró correctamente.");
    } catch (caughtError) {
      setFormError(
        getErrorMessage(caughtError, "No fue posible registrar el pago."),
      );
    } finally {
      setIsSaving(false);
      setIsPaymentsLoading(false);
    }
  }

  if (isLoading) {
    return (
      <section className="mx-auto max-w-5xl animate-pulse" role="status">
        <div className="h-4 w-28 rounded bg-slate-200" />
        <div className="mt-5 h-9 w-80 max-w-full rounded bg-slate-200" />
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="h-36 rounded-xl bg-white shadow-sm ring-1 ring-slate-200" />
          <div className="h-36 rounded-xl bg-white shadow-sm ring-1 ring-slate-200" />
        </div>
        <div className="mt-8 h-60 rounded-xl bg-white shadow-sm ring-1 ring-slate-200" />
        <span className="sr-only">Cargando información del alumno...</span>
      </section>
    );
  }

  if (error || !student) {
    return (
      <section className="rounded-xl border border-red-200 bg-red-50 p-6">
        <h1 className="text-lg font-semibold text-red-800">No fue posible mostrar el alumno</h1>
        <p className="mt-2 text-sm text-red-700">{error}</p>
        <Link href="/dashboard/admin/alumnos" className="mt-5 inline-block text-sm font-medium text-red-800 underline">
          Volver a alumnos
        </Link>
      </section>
    );
  }

  const effectiveEnrollmentCost = configuration
    ? getDiscountedCost(configuration.costo_inscripcion, scholarship, "inscripcion")
    : 0;
  const effectiveMonthlyCost = configuration
    ? getDiscountedCost(configuration.costo_mensualidad, scholarship, "mensualidad")
    : 0;
  const monthlyStatuses = ACADEMIC_MONTHS.map((academicMonth) => {
    const year = getAcademicMonthYear(academicMonth.value, cycle);
    const paidAmount = payments
      .filter(
        (payment) =>
          payment.tipo_pago === "mensualidad" &&
          payment.mes === academicMonth.value &&
          payment.anio === year,
      )
      .reduce((total, payment) => total + payment.monto, 0);

    return {
      ...academicMonth,
      year,
      paidAmount,
      isPaid:
        configuration !== null &&
        paidAmount >= effectiveMonthlyCost,
    };
  });
  const nextPendingMonth = monthlyStatuses.find((month) => !month.isPaid);
  const isEnrollmentPending = student.deuda_inscripcion > 0;
  const activePaymentType = isEnrollmentPending
    ? ("inscripcion" as const)
    : nextPendingMonth
      ? ("mensualidad" as const)
      : null;
  const activeMonth = isEnrollmentPending
    ? ("agosto" as const)
    : nextPendingMonth?.value ?? null;
  const activeYear = activeMonth
    ? getAcademicMonthYear(activeMonth, cycle)
    : null;
  const activeCost = configuration
    ? isEnrollmentPending
      ? effectiveEnrollmentCost
      : effectiveMonthlyCost
    : 0;
  const activePaidAmount = isEnrollmentPending
    ? Math.max(activeCost - student.deuda_inscripcion, 0)
    : nextPendingMonth?.paidAmount ?? activeCost;
  const activePendingAmount = Math.max(activeCost - activePaidAmount, 0);
  const activeConceptLabel = isEnrollmentPending
    ? `Inscripción agosto ${activeYear ?? ""}`
    : nextPendingMonth
      ? `Mensualidad ${nextPendingMonth.label} ${nextPendingMonth.year}`
      : "Ciclo escolar liquidado";
  const canRegisterPayment =
    student.estado === "activo" ||
    (student.estado === "pausa" &&
      student.pausa_automatica_inscripcion &&
      activePaymentType === "inscripcion");

  return (
    <section className="mx-auto max-w-5xl">
      <Link href="/dashboard/admin/alumnos" className="text-sm font-medium text-sky-600 hover:text-sky-800">
        ← Volver a alumnos
      </Link>

      <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-sky-600">Detalle del alumno</p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold text-slate-950">
              {getFullStudentName(student)}
            </h1>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium capitalize text-slate-600 ring-1 ring-inset ring-slate-300">
              {student.estado}
            </span>
          </div>
          <p className="mt-2 text-sm capitalize text-slate-500">
            {student.nivel} · {student.grado}° grado · Grupo {student.grupo}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!isEditing && (
            <button
              type="button"
              onClick={beginEditing}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Editar información
            </button>
          )}
          <label className="sr-only" htmlFor="academic-status">Estado académico</label>
          <select
            id="academic-status"
            value={student.estado}
            disabled={isUpdatingStatus}
            onChange={(event) => void handleStatusChange(event.target.value as Alumno["estado"])}
            className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <option value="activo">Activo</option>
            <option value="pausa">Pausa temporal</option>
            <option value="baja">Baja definitiva</option>
          </select>
        </div>
      </div>

      {profileMessage && (
        <p
          role="status"
          className="mt-6 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
        >
          {profileMessage}
        </p>
      )}

      {profileError && (
        <p
          role="alert"
          className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {profileError}
        </p>
      )}

      {isEditing && (
        <form
          id="editar-informacion"
          onSubmit={handleUpdate}
          className="mt-8 grid gap-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:grid-cols-2"
        >
          <div className="sm:col-span-2">
            <label htmlFor="editName" className="text-sm font-medium text-slate-700">
              Nombre(s)
            </label>
            <input
              id="editName"
              type="text"
              required
              value={editName}
              onChange={(event) => setEditName(event.target.value)}
              className={fieldClass}
            />
          </div>
          <div>
            <label
              htmlFor="editPaternalSurname"
              className="text-sm font-medium text-slate-700"
            >
              Apellido paterno
            </label>
            <input
              id="editPaternalSurname"
              type="text"
              required
              value={editPaternalSurname}
              onChange={(event) =>
                setEditPaternalSurname(event.target.value)
              }
              className={fieldClass}
            />
          </div>
          <div>
            <label
              htmlFor="editMaternalSurname"
              className="text-sm font-medium text-slate-700"
            >
              Apellido materno
            </label>
            <input
              id="editMaternalSurname"
              type="text"
              value={editMaternalSurname}
              onChange={(event) =>
                setEditMaternalSurname(event.target.value)
              }
              className={fieldClass}
            />
          </div>
          <div>
            <label htmlFor="editLevel" className="text-sm font-medium text-slate-700">
              Nivel
            </label>
            <select
              id="editLevel"
              value={editLevel}
              onChange={(event) => {
                setEditLevel(event.target.value as Alumno["nivel"]);
                setEditGrade("1");
              }}
              className={fieldClass}
            >
              <option value="primaria">Primaria</option>
              <option value="secundaria">Secundaria</option>
              <option value="bachillerato">Bachillerato</option>
            </select>
          </div>
          <div>
            <label htmlFor="editGrade" className="text-sm font-medium text-slate-700">
              Grado
            </label>
            <select
              id="editGrade"
              value={editGrade}
              onChange={(event) => setEditGrade(event.target.value)}
              className={fieldClass}
            >
              {Array.from(
                { length: editLevel === "primaria" ? 6 : 3 },
                (_, index) => index + 1,
              ).map((grade) => (
                <option key={grade} value={grade}>
                  {grade}°
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="editGroup" className="text-sm font-medium text-slate-700">
              Grupo
            </label>
            <input
              id="editGroup"
              type="text"
              required
              maxLength={10}
              value={editGroup}
              onChange={(event) => setEditGroup(event.target.value)}
              className={fieldClass}
            />
          </div>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button
              type="submit"
              disabled={isUpdating}
              className="rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isUpdating ? "Guardando..." : "Guardar cambios"}
            </button>
            <button
              type="button"
              disabled={isUpdating}
              onClick={() => {
                setIsEditing(false);
                setProfileError("");
              }}
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <article className="rounded-xl border border-violet-200 bg-violet-50 p-6">
          <p className="text-sm font-medium text-violet-800">
            {activeConceptLabel}
          </p>
          {configuration ? (
            <>
              <p className="mt-2 text-3xl font-bold tabular-nums text-violet-950">
                {currencyFormatter.format(activeCost)}
              </p>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-violet-800">
                <p>
                  Abonado:{" "}
                  <span className="font-semibold">
                    {currencyFormatter.format(activePaidAmount)}
                  </span>
                </p>
                <p>
                  Pendiente:{" "}
                  <span className="font-semibold">
                    {currencyFormatter.format(activePendingAmount)}
                  </span>
                </p>
              </div>
            </>
          ) : (
            <p className="mt-3 text-sm text-violet-800">
              Configura los costos para mostrar el concepto actual.
            </p>
          )}
        </article>
        <article className="rounded-xl border border-sky-200 bg-sky-50 p-6">
          <p className="text-sm font-medium text-sky-800">Ciclo escolar</p>
          <div
            role="group"
            aria-label="Navegación de ciclo escolar"
            className="mt-2 inline-flex items-stretch overflow-hidden rounded-xl border border-sky-200 bg-white shadow-sm"
          >
            <button
              type="button"
              onClick={() => moveCycle(-1)}
              disabled={isPaymentsLoading || isSaving}
              aria-label="Ir al ciclo escolar anterior"
              title="Ciclo anterior"
              className="grid w-11 place-items-center border-r border-sky-100 text-sky-700 transition hover:bg-sky-100 focus:z-10 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            <div className="min-w-36 px-4 py-2 text-center">
              <p className="text-lg font-bold tabular-nums text-sky-950">
                {cycle}
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-700">
                {cycle === currentAcademicCycle ? "Ciclo actual" : "Agosto — Julio"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => moveCycle(1)}
              disabled={isPaymentsLoading || isSaving}
              aria-label="Ir al ciclo escolar siguiente"
              title="Ciclo siguiente"
              className="grid w-11 place-items-center border-l border-sky-100 text-sky-700 transition hover:bg-sky-100 focus:z-10 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <p className="mt-2 text-xs text-sky-700">
            {configuration
              ? `Mensualidad: ${currencyFormatter.format(effectiveMonthlyCost)}`
              : configurationError}
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
        {scholarship && (
          <article className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 sm:col-span-2">
            <p className="text-sm font-medium text-emerald-800">Beca aplicada</p>
            <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
              <div><p className="text-xl font-bold text-emerald-950">{scholarship.becas.nombre} · {Number(scholarship.porcentaje_aplicado).toFixed(2)}%</p><p className="mt-1 text-xs text-emerald-700">Aplica a {getScholarshipScopeLabel(scholarship.alcance_aplicado).toLocaleLowerCase("es-MX")} durante {cycle}.</p></div>
              {configuration && <div className="text-right text-xs text-emerald-800">{scholarshipAppliesTo(scholarship, "inscripcion") && <p>Inscripción: <span className="line-through">{currencyFormatter.format(configuration.costo_inscripcion)}</span> <strong className="ml-1 no-underline">{currencyFormatter.format(effectiveEnrollmentCost)}</strong></p>}{scholarshipAppliesTo(scholarship, "mensualidad") && <p className="mt-1">Mensualidad: <span className="line-through">{currencyFormatter.format(configuration.costo_mensualidad)}</span> <strong className="ml-1 no-underline">{currencyFormatter.format(effectiveMonthlyCost)}</strong></p>}</div>}
            </div>
          </article>
        )}
      </div>

      <div id="registrar-pago" className="mt-8 scroll-mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div>
          <h2 className="text-xl font-semibold text-slate-950">Registrar pago</h2>
          <p className="mt-1 text-sm text-slate-500">
            Captura el abono que deseas registrar para este alumno.
          </p>
        </div>

        <form onSubmit={handlePaymentSubmit} className="mt-6 grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="amount" className="block text-sm font-medium text-slate-700">
              Monto a pagar
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 mt-1 -translate-y-1/2 text-sm text-slate-500">$</span>
              <input
                id="amount"
                name="amount"
                type="number"
                min="0.01"
                max={activePendingAmount || undefined}
                step="0.01"
                inputMode="decimal"
                required
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0.00"
                className={`${fieldClass} pl-8`}
              />
            </div>
          </div>

          <div>
            <label htmlFor="payment-method" className="block text-sm font-medium text-slate-700">
              Método de pago
            </label>
            <select id="payment-method" required value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as MetodoPago)} className={fieldClass}>
              {PAYMENT_METHOD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <p className="block text-sm font-medium text-slate-700">
              Concepto automático
            </p>
            <div className="mt-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3">
              <p className="text-sm font-semibold text-sky-950">
                {activeConceptLabel}
              </p>
              {configuration && activePaymentType && (
                <p className="mt-1 text-xs text-sky-700">
                  Saldo por cubrir:{" "}
                  {currencyFormatter.format(activePendingAmount)}
                </p>
              )}
            </div>
          </div>

          {student.estado === "pausa" && student.pausa_automatica_inscripcion && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 sm:col-span-2">
              El alumno está en pausa porque venció su inscripción. Puede liquidar únicamente la inscripción y será reactivado automáticamente al completar el pago.
            </p>
          )}
          {!canRegisterPayment && (
            <p className="rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-700 sm:col-span-2">
              El registro de pagos está bloqueado por el estado académico actual del alumno.
            </p>
          )}

          {formError && (
            <p role="alert" className="text-sm text-red-600 sm:col-span-2">
              {formError}
            </p>
          )}

          {successMessage && (
            <p
              role="status"
              className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700 sm:col-span-2"
            >
              {successMessage}
            </p>
          )}

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={
                isSaving ||
                isPaymentsLoading ||
                !configuration ||
                activePaymentType === null ||
                !canRegisterPayment
              }
              className="rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? "Registrando..." : "Registrar Pago"}
            </button>
          </div>
        </form>
      </div>

      <section className="mt-8">
        <div>
          <h2 className="text-xl font-semibold text-slate-950">
            Mensualidades del ciclo
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Agosto a julio · deuda pendiente total:{" "}
            {currencyFormatter.format(student.deuda_mensualidad)}
          </p>
        </div>
        {paymentsError && (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {paymentsError}
          </p>
        )}
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
                    Costo:{" "}
                    {currencyFormatter.format(effectiveMonthlyCost)}
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
        studentId={studentId}
        refreshKey={payments.length}
        editable
        onPaymentUpdated={handlePaymentUpdated}
      />
    </section>
  );
}
