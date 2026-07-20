"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import {
  getPaymentMethodLabel,
  PAYMENT_METHOD_OPTIONS,
} from "@/lib/payments";
import type { MetodoPago, Pago } from "@/types/database";

const PAGE_SIZE = 10;

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
  studentId,
  refreshKey = 0,
  editable = false,
  onPaymentUpdated,
}: {
  studentId: string;
  refreshKey?: number;
  editable?: boolean;
  onPaymentUpdated?: () => void | Promise<void>;
}) {
  const [payments, setPayments] = useState<Pago[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedPayment, setSelectedPayment] = useState<Pago | null>(null);
  const [newAmount, setNewAmount] = useState("");
  const [editedPaymentMethod, setEditedPaymentMethod] =
    useState<MetodoPago>("efectivo");
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [editError, setEditError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleteConfirmationOpen, setIsDeleteConfirmationOpen] = useState(false);
  const [toast, setToast] = useState("");
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const columnCount = editable ? 6 : 5;

  useEffect(() => {
    let mounted = true;

    async function loadPage() {
      setIsLoading(true);
      setError("");
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, count, error: queryError } = await getSupabaseBrowserClient()
        .from("pagos")
        .select("id, alumno_id, nivel_cobro, monto, tipo_pago, metodo_pago, fecha_pago, mes, anio, ciclo_escolar", { count: "exact" })
        .eq("alumno_id", studentId)
        .order("fecha_pago", { ascending: false })
        .range(from, to);

      if (!mounted) return;
      if (queryError) {
        setError(queryError.message);
        setPayments([]);
      } else {
        setPayments(data);
        setTotal(count ?? 0);
      }
      setIsLoading(false);
    }

    void loadPage();
    return () => {
      mounted = false;
    };
  }, [page, refreshKey, reloadKey, studentId]);

  useEffect(() => {
    setPage(1);
  }, [studentId]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 5_000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  function openEditor(payment: Pago) {
    setSelectedPayment(payment);
    setNewAmount(String(payment.monto));
    setEditedPaymentMethod(payment.metodo_pago);
    setReason("");
    setPassword("");
    setEditError("");
  }

  function closeEditor() {
    if (isSaving) return;
    setIsDeleteConfirmationOpen(false);
    setSelectedPayment(null);
    setEditError("");
    setPassword("");
  }

  async function handlePaymentUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPayment) return;

    const amount = Number(newAmount);
    setEditError("");
    if (!Number.isFinite(amount) || amount <= 0) {
      setEditError("Ingresa un monto mayor a cero.");
      return;
    }
    if (
      Math.round(amount * 100) === Math.round(selectedPayment.monto * 100) &&
      editedPaymentMethod === selectedPayment.metodo_pago
    ) {
      setEditError("Modifica el monto o el método de pago antes de guardar.");
      return;
    }
    if (reason.trim().length < 5) {
      setEditError("Explica el motivo de la modificación con al menos 5 caracteres.");
      return;
    }
    if (!password) {
      setEditError("Ingresa tu contraseña para confirmar la modificación.");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch("/api/admin/payments/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({
          paymentId: selectedPayment.id,
          amount,
          paymentMethod: editedPaymentMethod,
          reason: reason.trim(),
          password,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error ?? "No fue posible modificar el pago.");
      }

      setSelectedPayment(null);
      setPassword("");
      setReloadKey((current) => current + 1);
      setToast("Pago modificado y saldos recalculados correctamente.");
      await onPaymentUpdated?.();
    } catch (caughtError) {
      setEditError(
        caughtError instanceof Error
          ? caughtError.message
          : "No fue posible modificar el pago.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  function requestPaymentDeletion() {
    setEditError("");
    if (reason.trim().length < 5) {
      setEditError("Explica el motivo de la eliminación con al menos 5 caracteres.");
      return;
    }
    if (!password) {
      setEditError("Ingresa tu contraseña para confirmar la eliminación.");
      return;
    }
    setIsDeleteConfirmationOpen(true);
  }

  async function handlePaymentDelete() {
    if (!selectedPayment) return;

    setIsSaving(true);
    setEditError("");
    try {
      const response = await fetch("/api/admin/payments/update", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({
          paymentId: selectedPayment.id,
          reason: reason.trim(),
          password,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error ?? "No fue posible eliminar el pago.");
      }

      setIsDeleteConfirmationOpen(false);
      setSelectedPayment(null);
      setPassword("");
      setReloadKey((current) => current + 1);
      setToast("Pago eliminado y saldos recalculados correctamente.");
      await onPaymentUpdated?.();
    } catch (caughtError) {
      setIsDeleteConfirmationOpen(false);
      setEditError(
        caughtError instanceof Error
          ? caughtError.message
          : "No fue posible eliminar el pago.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  const fromLabel = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const toLabel = Math.min(page * PAGE_SIZE, total);

  return (
    <section className="mt-8">
      <div>
        <h2 className="text-xl font-semibold text-slate-950">Historial de Pagos</h2>
        <p className="mt-1 text-sm text-slate-500">Movimientos registrados del más reciente al más antiguo.</p>
      </div>

      <div className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="max-h-[400px] overflow-auto">
          <table className="min-w-[760px] w-full divide-y divide-slate-200">
            <thead className="sticky top-0 z-10 bg-white shadow-[0_1px_0_0_rgb(226_232_240)]">
              <tr>
                {["Fecha de pago", "Tipo de pago", "Periodo", "Método / Folio"].map((heading) => (
                  <th key={heading} scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">{heading}</th>
                ))}
                <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">Monto</th>
                {editable && <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">Acción</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && (
                <tr><td colSpan={columnCount} className="px-4 py-10 text-center text-sm text-slate-500"><span className="inline-flex items-center gap-2"><LoaderCircle className="h-4 w-4 animate-spin" />Cargando historial...</span></td></tr>
              )}
              {!isLoading && error && <tr><td colSpan={columnCount} className="px-4 py-10 text-center text-sm text-red-600">{error}</td></tr>}
              {!isLoading && !error && payments.length === 0 && <tr><td colSpan={columnCount} className="px-4 py-10 text-center text-sm text-slate-500">No se han registrado pagos para este alumno.</td></tr>}
              {!isLoading && !error && payments.map((payment) => (
                <tr key={payment.id} className="transition-colors hover:bg-gray-50">
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">{dateFormatter.format(new Date(payment.fecha_pago))}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm font-medium capitalize text-slate-900">{payment.tipo_pago}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm capitalize text-slate-600">{payment.mes} {payment.anio}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">{getPaymentMethodLabel(payment.metodo_pago)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-semibold tabular-nums text-slate-900">{currencyFormatter.format(payment.monto)}</td>
                  {editable && (
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <button type="button" onClick={() => openEditor(payment)} aria-label={`Modificar pago de ${currencyFormatter.format(payment.monto)}`} title="Modificar pago" className="inline-grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500">
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <footer className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>Mostrando {fromLabel}-{toLabel} de {total} pagos</p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1 || isLoading} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft className="h-4 w-4" />Anterior</button>
            <span className="min-w-16 text-center text-xs">{page} de {totalPages}</span>
            <button type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages || isLoading} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-40">Siguiente<ChevronRight className="h-4 w-4" /></button>
          </div>
        </footer>
      </div>

      {selectedPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-[2px]" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="edit-payment-title" className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-sky-600">Corrección auditada</p>
                <h3 id="edit-payment-title" className="mt-1 text-xl font-bold text-slate-950">Modificar pago</h3>
                <p className="mt-1 text-sm capitalize text-slate-500">{selectedPayment.tipo_pago} · {selectedPayment.mes} {selectedPayment.anio}</p>
              </div>
              <button type="button" onClick={closeEditor} disabled={isSaving} aria-label="Cerrar" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 disabled:opacity-40"><X className="h-5 w-5" /></button>
            </div>

            <form onSubmit={handlePaymentUpdate} className="mt-6 space-y-5">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Monto registrado: <span className="font-semibold text-slate-950">{currencyFormatter.format(selectedPayment.monto)}</span>
              </div>
              <div>
                <label htmlFor="edited-payment-amount" className="text-sm font-medium text-slate-700">Nuevo monto</label>
                <input id="edited-payment-amount" type="number" min="0.01" step="0.01" required value={newAmount} onChange={(event) => setNewAmount(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" />
              </div>
              <div>
                <label htmlFor="edited-payment-method" className="text-sm font-medium text-slate-700">Método de pago</label>
                <select id="edited-payment-method" required value={editedPaymentMethod} onChange={(event) => setEditedPaymentMethod(event.target.value as MetodoPago)} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100">
                  {PAYMENT_METHOD_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="payment-edit-reason" className="text-sm font-medium text-slate-700">Motivo de la corrección o eliminación</label>
                <textarea id="payment-edit-reason" required minLength={5} maxLength={500} rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Ej. Corrección por error de captura" className="mt-2 w-full resize-none rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" />
              </div>
              <div>
                <label htmlFor="payment-edit-password" className="text-sm font-medium text-slate-700">Confirma tu contraseña</label>
                <input id="payment-edit-password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" />
              </div>
              {editError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{editError}</p>}
              <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
                <button type="button" onClick={requestPaymentDeletion} disabled={isSaving} className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"><Trash2 className="h-4 w-4" />Eliminar pago</button>
                <div className="flex justify-end gap-3">
                  <button type="button" onClick={closeEditor} disabled={isSaving} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancelar</button>
                  <button type="submit" disabled={isSaving} className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60">{isSaving && <LoaderCircle className="h-4 w-4 animate-spin" />}Confirmar modificación</button>
                </div>
              </div>
            </form>
          </section>
        </div>
      )}

      {selectedPayment && isDeleteConfirmationOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 p-4" role="presentation">
          <section role="alertdialog" aria-modal="true" aria-labelledby="delete-payment-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-700">
              <AlertTriangle className="h-6 w-6" aria-hidden="true" />
            </div>
            <h3 id="delete-payment-title" className="mt-4 text-xl font-bold text-slate-950">¿Eliminar este pago?</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Se eliminará el pago de <span className="font-semibold text-slate-950">{currencyFormatter.format(selectedPayment.monto)}</span> correspondiente a <span className="capitalize">{selectedPayment.tipo_pago} · {selectedPayment.mes} {selectedPayment.anio}</span>. Los saldos y la beca se recalcularán automáticamente.
            </p>
            <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              Esta acción no puede deshacerse desde la interfaz, pero quedará registrada en la auditoría con el motivo indicado.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setIsDeleteConfirmationOpen(false)} disabled={isSaving} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Conservar pago</button>
              <button type="button" onClick={() => void handlePaymentDelete()} disabled={isSaving} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60">{isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}Sí, eliminar pago</button>
            </div>
          </section>
        </div>
      )}

      {toast && <div role="status" className="fixed bottom-6 right-6 z-[60] max-w-sm rounded-xl bg-emerald-600 px-5 py-3 text-sm font-medium text-white shadow-xl">{toast}</div>}
    </section>
  );
}
