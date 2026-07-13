import type { ReactNode } from "react";
import { Sidebar } from "@/components/Sidebar";
import type { UserRole } from "@/types/user";
export function DashboardShell({ role, children }: { role: UserRole; children: ReactNode }) {
  return <div className="min-h-screen bg-slate-50"><Sidebar role={role} /><main className="px-6 pb-8 pt-24 md:ml-64 md:px-10 md:pt-10">{children}</main></div>;
}
