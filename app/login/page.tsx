"use client";

import Image from "next/image";
import type { FormEvent } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { normalizeLoginIdentifier } from "@/lib/student-access";

const fieldClass =
  "w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-brand-navy focus:ring-2 focus:ring-sky-100";

const AUTH_TIMEOUT_MS = 15_000;

function getLoginErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return "No fue posible iniciar sesión. Inténtalo nuevamente.";
  }

  if (error.message.includes("NEXT_PUBLIC_SUPABASE")) {
    return error.message;
  }

  const message = error.message.toLowerCase();
  if (
    message.includes("timeout") ||
    message.includes("fetch") ||
    message.includes("network") ||
    message.includes("conectar")
  ) {
    return "No fue posible conectar con Supabase. Revisa tu conexión e inténtalo nuevamente.";
  }

  if (message.includes("invalid login credentials")) {
    return "Usuario o contraseña incorrectos.";
  }

  return "No fue posible iniciar sesión. Verifica tus datos e inténtalo nuevamente.";
}

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const supabase = getSupabaseBrowserClient();
      const signInRequest = supabase.auth.signInWithPassword({
          email: normalizeLoginIdentifier(identifier),
          password,
        });
      const timeout = new Promise<never>((_, reject) => {
        window.setTimeout(
          () => reject(new Error("Tiempo de conexión agotado")),
          AUTH_TIMEOUT_MS,
        );
      });
      const { data, error: signInError } = await Promise.race([
        signInRequest,
        timeout,
      ]);

      if (signInError) throw signInError;

      const role = data.user.app_metadata.role;
      if (role !== "admin" && role !== "student") {
        await supabase.auth.signOut();
        throw new Error("La cuenta no tiene un rol válido asignado.");
      }

      const destination =
        role === "admin" ? "/dashboard/admin" : "/dashboard/alumno";

      router.replace(destination);
      router.refresh();
    } catch (caughtError) {
      console.error("Error al iniciar sesión:", caughtError);
      setError(getLoginErrorMessage(caughtError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f4f5f8] px-4 py-12 before:absolute before:inset-x-0 before:top-0 before:h-1.5 before:bg-brand-red">
      <section className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-[0_18px_50px_rgba(10,17,66,0.10)] sm:p-10">
        <div className="mb-7 flex justify-center">
          <Image
            src="/logo-cejv-comprobante.png"
            alt="Logo de la Sociedad de Educación Integral San Nicolás A.C."
            width={150}
            height={86}
            className="h-auto w-36 object-contain"
            priority
          />
        </div>
        <p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-brand-red">
          Portal escolar
        </p>
        <h1 className="mt-2 text-center text-3xl font-bold tracking-tight text-brand-navy">
          Iniciar sesión
        </h1>
        <p className="mt-2 text-center text-sm text-slate-500">
          Ingresa tu clave de acceso o correo administrativo y tu contraseña.
        </p>

        <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
          <div>
            <label
              htmlFor="identifier"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              Clave de acceso o correo
            </label>
            <input
              id="identifier"
              name="identifier"
              type="text"
              autoComplete="username"
              required
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              placeholder="CE260001"
              className={fieldClass}
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              Contraseña
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              className={fieldClass}
            />
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-lg bg-red-50 px-3.5 py-3 text-sm text-red-700"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-brand-navy px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-brand-navy focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Ingresando..." : "Entrar"}
          </button>
        </form>
      </section>
    </main>
  );
}
