import type { ReactNode } from "react";
import { DashboardShell } from "@/components/DashboardShell";

export default function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <DashboardShell role="admin">{children}</DashboardShell>;
}
