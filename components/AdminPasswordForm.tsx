"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

const fieldClass =
  "mt-2 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 pr-11 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100";

type PasswordFieldProps = {
  id: string;
  label: string;
  value: string;
  autoComplete: "current-password" | "new-password";
  disabled: boolean;
  onChange: (value: string) => void;
};

function PasswordField({
  id,
  label,
  value,
  autoComplete,
  disabled,
  onChange,
}: PasswordFieldProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={isVisible ? "text" : "password"}
          required
          maxLength={72}
          autoComplete={autoComplete}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className={fieldClass}
        />
        <button
          type="button"
          onClick={() => setIsVisible((current) => !current)}
          disabled={disabled}
          aria-label={isVisible ? `Ocultar ${label.toLowerCase()}` : `Mostrar ${label.toLowerCase()}`}
          className="absolute bottom-0 right-0 grid h-[42px] w-11 place-items-center text-slate-400 transition hover:text-slate-700 disabled:opacity-50"
        >
          {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

export function AdminPasswordForm() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function toggleForm() {
    setIsExpanded((current) => !current);
    setError("");
    setMessage("");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (newPassword.length < 8) {
      setError("La nueva contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (newPassword.length > 72) {
      setError("La nueva contraseña no puede superar los 72 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("La nueva contraseña y su confirmación no coinciden.");
      return;
    }
    if (currentPassword === newPassword) {
      setError("La nueva contraseña debe ser diferente a la contraseña actual.");
      return;
    }

    setIsSaving(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: userResult, error: userError } = await supabase.auth.getUser();
      const user = userResult.user;

      if (userError || !user?.email) {
        throw new Error("La sesión expiró. Inicia sesión nuevamente.");
      }
      if (user.app_metadata.role !== "admin") {
        throw new Error("Esta acción solo está disponible para administradores.");
      }

      const { error: verificationError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });
      if (verificationError) {
        throw new Error("La contraseña actual no es correcta.");
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (updateError) {
        const isSamePassword = updateError.message.toLowerCase().includes("different");
        throw new Error(
          isSamePassword
            ? "La nueva contraseña debe ser diferente a la contraseña actual."
            : "Supabase rechazó la nueva contraseña. Utiliza una combinación más segura.",
        );
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage("La contraseña del administrador se actualizó correctamente.");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "No fue posible actualizar la contraseña.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="rounded-lg bg-slate-100 p-2 text-sky-700">
            <KeyRound className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Contraseña del administrador</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Administra la contraseña de la cuenta con la que tienes la sesión iniciada.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={toggleForm}
          disabled={isSaving}
          aria-expanded={isExpanded}
          aria-controls="admin-password-fields"
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          {isExpanded ? "Ocultar campos" : "Cambiar contraseña"}
        </button>
      </div>

      {isExpanded && (
        <div id="admin-password-fields">
          <div className="mt-5 flex items-start gap-2 rounded-lg border border-slate-200 px-4 py-3 text-xs leading-5 text-slate-600">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" aria-hidden="true" />
            Se verificará tu contraseña actual antes de aplicar el cambio. La contraseña nunca se guarda en la base de datos del portal.
          </div>

          <form onSubmit={handleSubmit} className="mt-6 grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2 sm:max-w-[calc(50%-0.625rem)]">
              <PasswordField
                id="admin-current-password"
                label="Contraseña actual"
                value={currentPassword}
                autoComplete="current-password"
                disabled={isSaving}
                onChange={setCurrentPassword}
              />
            </div>
            <PasswordField
              id="admin-new-password"
              label="Nueva contraseña"
              value={newPassword}
              autoComplete="new-password"
              disabled={isSaving}
              onChange={setNewPassword}
            />
            <PasswordField
              id="admin-confirm-password"
              label="Confirmar nueva contraseña"
              value={confirmPassword}
              autoComplete="new-password"
              disabled={isSaving}
              onChange={setConfirmPassword}
            />

            <p className="text-xs leading-5 text-slate-500 sm:col-span-2">
              Utiliza entre 8 y 72 caracteres y evita contraseñas utilizadas anteriormente.
            </p>

            {error && (
              <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:col-span-2">
                {error}
              </p>
            )}
            {message && (
              <p role="status" className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 sm:col-span-2">
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                {message}
              </p>
            )}

            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {isSaving ? "Actualizando contraseña..." : "Guardar nueva contraseña"}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
