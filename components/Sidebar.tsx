"use client";

import Link from "next/link";
import { useState } from "react";
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
  ],
  student: [{ label: "Mi cuenta", href: "/dashboard/alumno" }],
};

export function Sidebar({ role, userName = "Usuario" }: SidebarProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-30 flex h-16 items-center justify-between border-b bg-white px-4 md:hidden">
        <Link href={role === "admin" ? "/dashboard/admin" : "/dashboard/alumno"} className="font-semibold">Gestión Escolar</Link>
        <button type="button" onClick={() => setIsOpen(!isOpen)} className="rounded-lg border p-2" aria-label="Abrir menú" aria-expanded={isOpen}>
          <span className="block h-0.5 w-5 bg-current" /><span className="my-1 block h-0.5 w-5 bg-current" /><span className="block h-0.5 w-5 bg-current" />
        </button>
      </header>
      {isOpen && <button type="button" className="fixed inset-0 z-30 bg-slate-950/40 md:hidden" onClick={() => setIsOpen(false)} aria-label="Cerrar menú" />}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-slate-950 px-4 py-6 text-white transition-transform md:translate-x-0 ${isOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="mb-8 px-3"><p className="text-xs uppercase tracking-[0.2em] text-sky-400">Portal escolar</p><p className="mt-2 text-xl font-semibold">Gestión de pagos</p></div>
        <nav className="flex-1 space-y-1" aria-label="Navegación principal">
          {linksByRole[role].map((link) => <Link key={link.href} href={link.href} onClick={() => setIsOpen(false)} className="block rounded-lg px-3 py-2.5 text-sm text-slate-300 hover:bg-slate-800 hover:text-white">{link.label}</Link>)}
        </nav>
        <div className="border-t border-slate-800 px-3 pt-4"><p className="truncate text-sm font-medium">{userName}</p><p className="mt-1 text-xs text-slate-400">{role === "admin" ? "Administrador" : "Alumno"}</p></div>
      </aside>
    </>
  );
}
