"use client";

import Link from "next/link";
import type { MouseEvent } from "react";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { invalidateAdminData, preloadAdminRoute } from "@/lib/admin-data";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import type { UserRole } from "@/types/user";

interface SidebarProps {
  role: UserRole;
  userName?: string;
}

const linksByRole: Record<UserRole, Array<{ label: string; href: string }>> = {
  admin: [
    { label: "Alumnos", href: "/dashboard/admin/alumnos" },
    { label: "Pagos", href: "/dashboard/admin/pagos" },
    { label: "Reportes", href: "/dashboard/admin/reportes" },
    { label: "Configuración", href: "/dashboard/admin/configuracion" },
  ],
  student: [{ label: "Mi cuenta", href: "/dashboard/alumno" }],
};

export function Sidebar({ role, userName = "Usuario" }: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const dashboardHome =
    role === "admin" ? "/dashboard/admin" : "/dashboard/alumno";

  function isActiveLink(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  useEffect(() => {
    setPendingHref(null);
    setIsOpen(false);
  }, [pathname]);

  function handleNavigation(
    event: MouseEvent<HTMLAnchorElement>,
    href: string,
  ) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    setIsOpen(false);
    if (pathname !== href) {
      setPendingHref(href);
      if (role === "admin") void preloadAdminRoute(href).catch(() => undefined);
    }
  }

  function handlePreload(href: string) {
    if (role === "admin") void preloadAdminRoute(href).catch(() => undefined);
  }

  async function handleSignOut() {
    setIsSigningOut(true);
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error("No fue posible cerrar la sesión:", error);
      setIsSigningOut(false);
      return;
    }

    invalidateAdminData();
    router.replace("/login");
    router.refresh();
  }

  return (
    <>
      {pendingHref && (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-x-0 top-0 z-[60] h-1 overflow-hidden bg-sky-950/20"
        >
          <div className="h-full w-full animate-pulse bg-sky-400" />
          <span className="sr-only">Cargando sección...</span>
        </div>
      )}
      <header className="fixed inset-x-0 top-0 z-30 flex h-16 items-center justify-between border-b bg-white px-4 md:hidden">
        <Link
          href={dashboardHome}
          onClick={(event) => handleNavigation(event, dashboardHome)}
          onMouseEnter={() => handlePreload(dashboardHome)}
          onFocus={() => handlePreload(dashboardHome)}
          className="font-semibold"
        >
          Portal Escolar
        </Link>
        <button type="button" onClick={() => setIsOpen(!isOpen)} className="rounded-lg border p-2" aria-label="Abrir menú" aria-expanded={isOpen}>
          <span className="block h-0.5 w-5 bg-current" /><span className="my-1 block h-0.5 w-5 bg-current" /><span className="block h-0.5 w-5 bg-current" />
        </button>
      </header>
      {isOpen && <button type="button" className="fixed inset-0 z-30 bg-slate-950/40 md:hidden" onClick={() => setIsOpen(false)} aria-label="Cerrar menú" />}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-slate-950 px-4 py-6 text-white transition-transform md:translate-x-0 ${isOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <Link
          href={dashboardHome}
          onClick={(event) => handleNavigation(event, dashboardHome)}
          onMouseEnter={() => handlePreload(dashboardHome)}
          onFocus={() => handlePreload(dashboardHome)}
          aria-current={pathname === dashboardHome ? "page" : undefined}
          aria-busy={pendingHref === dashboardHome}
          className={`mb-8 block rounded-lg px-3 py-2 transition hover:bg-slate-900 ${
            pathname === dashboardHome || pendingHref === dashboardHome
              ? "bg-slate-900 ring-1 ring-slate-800"
              : ""
          }`}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-400">
            Portal Escolar
          </p>
          <p className="mt-2 text-xl font-semibold">Gestión de pagos</p>
        </Link>
        <nav className="flex-1 space-y-1" aria-label="Navegación principal">
          {linksByRole[role].map((link) => {
            const isActive = isActiveLink(link.href);
            const isPending = pendingHref === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={(event) => handleNavigation(event, link.href)}
                onMouseEnter={() => handlePreload(link.href)}
                onFocus={() => handlePreload(link.href)}
                aria-current={isActive ? "page" : undefined}
                aria-busy={isPending}
                className={`flex items-center justify-between gap-3 rounded-lg border-l-2 px-3 py-2.5 text-sm font-medium transition ${
                  isPending
                    ? "border-sky-300 bg-sky-500/20 text-white ring-1 ring-inset ring-sky-400/30"
                    : isActive
                      ? "border-sky-400 bg-slate-800 text-white"
                    : "border-transparent text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <span>{link.label}</span>
                {isPending && (
                  <span
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-sky-200 border-t-transparent"
                  />
                )}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-slate-800 px-3 pt-4">
          <p className="truncate text-sm font-medium">{userName}</p>
          <p className="mt-1 text-xs text-slate-400">
            {role === "admin" ? "Administrador" : "Alumno"}
          </p>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={isSigningOut}
            className="mt-4 w-full rounded-lg border border-slate-700 px-3 py-2 text-left text-sm font-medium text-slate-300 transition hover:border-slate-600 hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSigningOut ? "Cerrando sesión..." : "Cerrar sesión"}
          </button>
        </div>
      </aside>
    </>
  );
}
