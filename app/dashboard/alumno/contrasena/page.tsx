"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { CheckCircle2, KeyRound, LoaderCircle } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

const fieldClass =
  "mt-2 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100";

export default function StudentPasswordPage() {
  const [usesTemporaryPassword, setUsesTemporaryPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadPasswordStatus() {
      const supabase = getSupabaseBrowserClient();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        if (isMounted) setIsLoading(false);
        return;
      }

      const { data } = await supabase
        .from("alumnos")
        .select("contrasena_temporal_activa")
        .eq("usuario_id", userData.user.id)
        .maybeSingle();

      if (isMounted) {
        setUsesTemporaryPassword(Boolean(data?.contrasena_temporal_activa));
        setIsLoading(false);
      }
    }

    void loadPasswordStatus();
    return () => {
      isMounted = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (newPassword.length < 8) {
      setError("La nueva contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch("/api/student/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword }),
      });
      const responseText = await response.text();
      let result: { error?: string } = {};
      try {
        result = responseText ? JSON.parse(responseText) : {};
      } catch {
        result = {};
      }
      if (!response.ok) {
        throw new Error(
          result.error || `No fue posible cambiar la contraseña (error ${response.status}).`,
        );
      }

      setUsesTemporaryPassword(false);
      setNewPassword("");
      setConfirmPassword("");
      setMessage("Tu contraseña se actualizó correctamente.");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "No fue posible cambiar la contraseña.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="mx-auto max-w-3xl">
      <div>
        <p className="text-sm font-medium text-sky-600">Mi cuenta</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">
          Contraseña
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Administra la contraseña con la que ingresas al portal escolar.
        </p>
      </div>

      <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex items-start gap-3">
          <span className="rounded-lg bg-slate-100 p-2 text-sky-700">
            <KeyRound className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-slate-950">
              Cambiar contraseña
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              {isLoading
                ? "Consultando el estado de tu acceso..."
                : usesTemporaryPassword
                  ? "Actualmente utilizas la contraseña predeterminada entregada por administración."
                  : "Tu cuenta utiliza una contraseña personal."}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-7 grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="new-password" className="text-sm font-medium text-slate-700">
              Nueva contraseña
            </label>
            <input
              id="new-password"
              type="password"
              minLength={8}
              maxLength={72}
              required
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className={fieldClass}
            />
          </div>
          <div>
            <label htmlFor="confirm-password" className="text-sm font-medium text-slate-700">
              Confirmar contraseña
            </label>
            <input
              id="confirm-password"
              type="password"
              minLength={8}
              maxLength={72}
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className={fieldClass}
            />
          </div>

          <p className="text-xs leading-5 text-slate-500 sm:col-span-2">
            Utiliza al menos 8 caracteres. No puedes reutilizar la contraseña predeterminada.
          </p>

          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 sm:col-span-2">
              {error}
            </p>
          )}
          {message && (
            <p role="status" className="flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700 sm:col-span-2">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              {message}
            </p>
          )}

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={isSaving || isLoading}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {isSaving ? "Actualizando..." : "Guardar nueva contraseña"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
