"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import type { Alumno } from "@/types/database";

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

    void loadStudent();

    return () => {
      isMounted = false;
    };
  }, [studentId]);

  async function handlePaymentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const numericAmount = Number(amount);
    setSuccessMessage("");

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setFormError("Ingresa un monto mayor a cero.");
      return;
    }

    setFormError("");
    setIsSaving(true);

    try {
      const supabase = getSupabaseBrowserClient();
      const { error: insertError } = await supabase.from("pagos").insert({
        alumno_id: studentId,
        monto: numericAmount,
        tipo_pago: paymentType,
      });

      if (insertError) throw insertError;

      const { data: updatedStudent, error: refreshError } = await supabase
        .from("alumnos")
        .select("*")
        .eq("id", studentId)
        .single();

      if (refreshError) throw refreshError;

      setStudent(updatedStudent);
      setAmount("");
      setSuccessMessage("El pago se registró y el saldo se actualizó correctamente.");
    } catch (caughtError) {
      setFormError(
        caughtError instanceof Error
          ? caughtError.message
          : "No fue posible registrar el pago.",
      );
    } finally {
      setIsSaving(false);
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

      <div className="mt-5">
        <p className="text-sm font-medium text-sky-600">Detalle del alumno</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-950">{student.nombre}</h1>
        <p className="mt-2 text-sm capitalize text-slate-500">
          {student.nivel} · {student.grado}° grado · Grupo {student.grupo}
        </p>
      </div>

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
    </section>
  );
}
