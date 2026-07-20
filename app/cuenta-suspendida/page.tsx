"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldX } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

export default function SuspendedAccountPage() {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function signOut() {
    setIsSigningOut(true);
    await getSupabaseBrowserClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-5">
      <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-xl">
        <ShieldX className="mx-auto h-12 w-12 text-red-600" aria-hidden="true" />
        <h1 className="mt-5 text-2xl font-bold text-slate-950">Cuenta suspendida por baja institucional</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">Tu acceso al portal escolar está bloqueado. Comunícate con la administración de la institución para aclarar tu situación.</p>
        <button type="button" onClick={signOut} disabled={isSigningOut} className="mt-7 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60">{isSigningOut ? "Cerrando sesión..." : "Volver al inicio de sesión"}</button>
      </section>
    </main>
  );
}
