import type { ReactNode } from "react";
import { DashboardShell } from "@/components/DashboardShell";
export default function StudentLayout({ children }: Readonly<{ children: ReactNode }>) { return <DashboardShell role="student">{children}</DashboardShell>; }
