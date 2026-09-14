import type { ReactNode } from "react";
import { Sidebar } from "@/components/Sidebar";
import type { UserRole } from "@/types/user";
export function DashboardShell({ role, children }: { role: UserRole; children: ReactNode }) {
  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-[#f7f8fa]">
      <Sidebar role={role} />
      <main className="box-border w-[100dvw] min-w-0 max-w-[100dvw] overflow-x-clip px-4 pb-8 pt-24 sm:px-6 lg:ml-64 lg:w-[calc(100dvw-16rem)] lg:max-w-[calc(100dvw-16rem)] lg:px-10 lg:pt-10">
        {children}
      </main>
    </div>
  );
}
