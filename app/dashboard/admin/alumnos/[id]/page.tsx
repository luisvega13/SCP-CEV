"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PaymentHistory } from "@/components/PaymentHistory";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import type { Alumno, Pago } from "@/types/database";

type PaymentType = "inscripcion" | "mensualidad";

const currencyFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

const fieldClass =
  "mt-2 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100";

export default function StudentDetailPage() {
  const params = useParams<{ id: string }>();
  const studentId = params.id;
  const [student, setStudent] = useState<Alumno | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [paymentType, setPaymentType] =
    useState<PaymentType>("mensualidad");
  const [formError, setFormError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [payments, setPayments] = useState<Pago[]>([]);
  const [isPaymentsLoading, setIsPaymentsLoading] = useState(true);
  const [paymentsError, setPaymentsError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
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
  }, [studentId]);

  function beginEditing() {
    if (!student) return;
    setEditName(student.nombre);
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
    const normalizedGroup = editGroup.trim().toUpperCase();
    const numericGrade = Number(editGrade);
    const maximumGrade = editLevel === "primaria" ? 6 : 3;

    setProfileError("");
    setProfileMessage("");

    if (!normalizedName || !normalizedGroup) {
      setProfileError("Nombre y grupo son campos obligatorios.");
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
          nivel: editLevel,
          grado: numericGrade,
          grupo: normalizedGroup,
        })
        .eq("id", studentId)
        .select("*")
        .single();

      if (updateError) throw updateError;

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

  async function handleStatusChange() {
    if (!student) return;

    const nextStatus: Alumno["estado"] =
      student.estado === "activo" ? "baja" : "activo";

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

      setStudent(data);
      setProfileMessage(
        nextStatus === "activo"
          ? "El alumno fue reactivado correctamente."
          : "El alumno fue dado de baja correctamente.",
      );
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

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setFormError("Ingresa un monto mayor a cero.");
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
        tipo_pago: paymentType,
      });

      if (insertError) throw insertError;

      setIsPaymentsLoading(true);
      const [studentResult, paymentsResult] = await Promise.all([
        supabase.from("alumnos").select("*").eq("id", studentId).single(),
        supabase
          .from("pagos")
          .select("*")
          .eq("alumno_id", studentId)
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
        caughtError instanceof Error
          ? caughtError.message
          : "No fue posible registrar el pago.",
      );
    } finally {
      setIsSaving(false);
      setIsPaymentsLoading(false);
    }
  }

  if (isLoading) {
    return <p className="py-12 text-center text-sm text-slate-500">Cargando alumno...</p>;
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
              {student.nombre}
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
          <button
            type="button"
            onClick={handleStatusChange}
            disabled={isUpdatingStatus}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${
              student.estado === "activo"
                ? "bg-red-600 hover:bg-red-700"
                : "bg-emerald-600 hover:bg-emerald-700"
            }`}
          >
            {isUpdatingStatus
              ? "Actualizando..."
              : student.estado === "activo"
                ? "Dar de baja"
                : "Reactivar alumno"}
          </button>
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
          onSubmit={handleUpdate}
          className="mt-8 grid gap-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:grid-cols-2"
        >
          <div className="sm:col-span-2">
            <label htmlFor="editName" className="text-sm font-medium text-slate-700">
              Nombre completo
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
        <article className="rounded-xl border border-amber-200 bg-amber-50 p-6">
          <p className="text-sm font-medium text-amber-800">Deuda de mensualidad</p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-amber-950">
            {currencyFormatter.format(student.deuda_mensualidad)}
          </p>
        </article>
        <article className="rounded-xl border border-violet-200 bg-violet-50 p-6">
          <p className="text-sm font-medium text-violet-800">Deuda de inscripción</p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-violet-950">
            {currencyFormatter.format(student.deuda_inscripcion)}
          </p>
        </article>
      </div>

      <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
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
            <label htmlFor="paymentType" className="block text-sm font-medium text-slate-700">
              Tipo de pago
            </label>
            <select
              id="paymentType"
              name="paymentType"
              value={paymentType}
              onChange={(event) => setPaymentType(event.target.value as PaymentType)}
              className={fieldClass}
            >
              <option value="inscripcion">Inscripción</option>
              <option value="mensualidad">Mensualidad</option>
            </select>
          </div>

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
              disabled={isSaving}
              className="rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? "Registrando..." : "Registrar Pago"}
            </button>
          </div>
        </form>
      </div>

      <PaymentHistory
        payments={payments}
        isLoading={isPaymentsLoading}
        error={paymentsError}
      />
    </section>
  );
}
