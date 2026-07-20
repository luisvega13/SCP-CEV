import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/DashboardShell";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export default async function StudentLayout({ children }: Readonly<{ children: ReactNode }>) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: student } = await supabase
    .from("alumnos")
    .select("estado")
    .eq("usuario_id", user.id)
    .maybeSingle();

  if (student?.estado === "baja") redirect("/cuenta-suspendida");
  return <DashboardShell role="student">{children}</DashboardShell>;
}
