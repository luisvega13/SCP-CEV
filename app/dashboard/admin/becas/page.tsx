"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  LoaderCircle,
  Plus,
  Search,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import { TableSkeletonRows } from "@/components/TableSkeletonRows";
import { getCurrentAcademicCycle, getFullStudentName } from "@/lib/academic";
import { invalidateAdminData } from "@/lib/admin-data";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import type { AlcanceBeca, Alumno, Beca } from "@/types/database";

const PAGE_SIZE = 10;

type ScholarshipAssignment = {
  id: string;
  alumno_id: string;
  beca_id: string;
  ciclo_escolar: string;
  observaciones: string;
  porcentaje_aplicado: number;
  alcance_aplicado: AlcanceBeca;
  fecha_asignacion: string;
  alumnos: Pick<Alumno, "id" | "nombre" | "apellido_paterno" | "apellido_materno" | "matricula" | "nivel" | "grado" | "grupo">;
  becas: Pick<Beca, "id" | "nombre" | "porcentaje" | "activa">;
};

type StudentOption = Pick<Alumno, "id" | "nombre" | "apellido_paterno" | "apellido_materno" | "matricula" | "nivel" | "grado" | "grupo">;

function createCycle(startYear: number) {
  return `${startYear}-${startYear + 1}`;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return fallback;
}

export default function ScholarshipsPage() {
  const currentCycle = getCurrentAcademicCycle();
  const [cycle, setCycle] = useState(currentCycle);
  const [assignments, setAssignments] = useState<ScholarshipAssignment[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [scholarships, setScholarships] = useState<Beca[]>([]);
  const [assignedStudentIds, setAssignedStudentIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [studentSearch, setStudentSearch] = useState("");
  const [studentId, setStudentId] = useState("");
  const [scholarshipId, setScholarshipId] = useState("");
  const [observations, setObservations] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [assignmentToRemove, setAssignmentToRemove] = useState<ScholarshipAssignment | null>(null);
  const [toast, setToast] = useState("");
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const supabase = getSupabaseBrowserClient();
      const from = (page - 1) * PAGE_SIZE;
      const [assignmentsResult, studentsResult, scholarshipsResult, assignedResult] = await Promise.all([
        supabase
          .from("alumnos_becas")
          .select("id, alumno_id, beca_id, ciclo_escolar, observaciones, porcentaje_aplicado, alcance_aplicado, fecha_asignacion, alumnos!inner(id, nombre, apellido_paterno, apellido_materno, matricula, nivel, grado, grupo), becas!inner(id, nombre, porcentaje, activa)", { count: "exact" })
          .eq("ciclo_escolar", cycle)
          .order("fecha_asignacion", { ascending: false })
          .range(from, from + PAGE_SIZE - 1),
        supabase
          .from("alumnos")
          .select("id, nombre, apellido_paterno, apellido_materno, matricula, nivel, grado, grupo")
          .eq("estado", "activo")
          .order("apellido_paterno")
          .limit(1000),
        supabase.from("becas").select("*").eq("activa", true).order("nombre"),
        supabase.from("alumnos_becas").select("alumno_id").eq("ciclo_escolar", cycle),
      ]);

      if (assignmentsResult.error) throw assignmentsResult.error;
      if (studentsResult.error) throw studentsResult.error;
      if (scholarshipsResult.error) throw scholarshipsResult.error;
      if (assignedResult.error) throw assignedResult.error;

      setAssignments(assignmentsResult.data as unknown as ScholarshipAssignment[]);
      setTotal(assignmentsResult.count ?? 0);
      setStudents(studentsResult.data);
      setScholarships(scholarshipsResult.data);
      setAssignedStudentIds(assignedResult.data.map((item) => item.alumno_id));
    } catch (caughtError) {
      setError(getErrorMessage(caughtError, "No fue posible cargar las becas."));
    } finally {
      setIsLoading(false);
    }
  }, [cycle, page]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 5_000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const availableStudents = useMemo(() => {
    const query = studentSearch.trim().toLocaleLowerCase("es-MX");
    return students.filter((student) => {
      if (assignedStudentIds.includes(student.id)) return false;
      if (!query) return true;
      return `${getFullStudentName(student)} ${student.matricula}`
        .toLocaleLowerCase("es-MX")
        .includes(query);
    });
  }, [assignedStudentIds, studentSearch, students]);

  function moveCycle(direction: -1 | 1) {
    const startYear = Number(cycle.split("-")[0]);
    setCycle(createCycle(startYear + direction));
    setPage(1);
  }

  function openAssignmentModal() {
    setStudentSearch("");
    setStudentId("");
    setScholarshipId(scholarships[0]?.id ?? "");
    setObservations("");
    setError("");
    setIsAssignModalOpen(true);
  }

  async function handleAssign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!studentId || !scholarshipId) {
      setError("Selecciona un alumno y una beca.");
      return;
    }
    setIsSaving(true);
    setError("");
    try {
      const { error: insertError } = await getSupabaseBrowserClient().rpc(
        "asignar_beca_alumno",
        {
          p_alumno_id: studentId,
          p_beca_id: scholarshipId,
          p_ciclo_escolar: cycle,
          p_observaciones: observations.trim(),
        },
      );
      if (insertError) throw insertError;
      invalidateAdminData("students:");
      invalidateAdminData("dashboard:");
      invalidateAdminData("reports:");
      setIsAssignModalOpen(false);
      setToast("Beca asignada correctamente.");
      await loadData();
    } catch (caughtError) {
      const message = getErrorMessage(caughtError, "No fue posible asignar la beca.");
      setError(message.includes("duplicate key") ? "El alumno ya tiene una beca asignada en este ciclo." : message);
    } finally {
      setIsSaving(false);
    }
  }

  async function removeAssignment() {
    if (!assignmentToRemove) return;
    setIsSaving(true);
    setError("");
    try {
      const { error: deleteError } = await getSupabaseBrowserClient().rpc(
        "retirar_beca_alumno",
        { p_asignacion_id: assignmentToRemove.id },
      );
      if (deleteError) throw deleteError;
      invalidateAdminData("students:");
      invalidateAdminData("dashboard:");
      invalidateAdminData("reports:");
      setAssignmentToRemove(null);
      setToast("La beca fue retirada del alumno.");
      if (assignments.length === 1 && page > 1) setPage((current) => current - 1);
      else await loadData();
    } catch (caughtError) {
      const message = getErrorMessage(
        caughtError,
        "No fue posible retirar la beca. Verifica la conexión e inténtalo nuevamente.",
      );
      setError(
        message.includes("ya existen pagos en este ciclo")
          ? "No se puede retirar esta beca porque el alumno todavía tiene pagos registrados en el ciclo. Abre el detalle del alumno, elimina primero los pagos relacionados desde ‘Historial de Pagos’ y vuelve a intentarlo."
          : message,
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="mx-auto max-w-7xl">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-sky-600">Administración</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-950">Becas</h1>
          <p className="mt-2 text-sm text-slate-500">Consulta y administra los alumnos beneficiados por ciclo escolar.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/dashboard/admin/becas/configuracion" className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Settings className="h-4 w-4" />Configurar becas</Link>
          <button type="button" onClick={openAssignmentModal} disabled={isLoading || scholarships.length === 0} className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"><Plus className="h-4 w-4" />Asignar beca</button>
        </div>
      </header>

      <div className="mt-7 inline-flex items-stretch overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm" role="group" aria-label="Navegación de ciclo escolar">
        <button type="button" onClick={() => moveCycle(-1)} disabled={isLoading} aria-label="Ciclo anterior" className="grid w-12 place-items-center border-r border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"><ChevronLeft className="h-5 w-5" /></button>
        <div className="min-w-44 px-5 py-2.5 text-center"><p className="font-semibold tabular-nums text-slate-950">{cycle}</p><p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">{cycle === currentCycle ? "Ciclo actual" : "Agosto — Julio"}</p></div>
        <button type="button" onClick={() => moveCycle(1)} disabled={isLoading} aria-label="Ciclo siguiente" className="grid w-12 place-items-center border-l border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"><ChevronRight className="h-5 w-5" /></button>
      </div>

      {error && !isAssignModalOpen && <p role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[900px] w-full divide-y divide-slate-200">
            <thead className="bg-slate-50"><tr>{["Alumno", "Matrícula", "Nivel / Grado / Grupo", "Beca", "Porcentaje", "Asignación"].map((heading) => <th key={heading} className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">{heading}</th>)}<th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">Acción</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && <TableSkeletonRows columns={7} label="Cargando becas..." />}
              {!isLoading && assignments.length === 0 && <tr><td colSpan={7} className="px-5 py-14 text-center"><GraduationCap className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm text-slate-500">No hay alumnos con beca en este ciclo.</p></td></tr>}
              {!isLoading && assignments.map((assignment) => (
                <tr key={assignment.id} className="hover:bg-slate-50">
                  <td className="px-5 py-4 text-sm font-medium text-slate-950">{getFullStudentName(assignment.alumnos)}</td>
                  <td className="whitespace-nowrap px-5 py-4 font-mono text-sm text-slate-600">{assignment.alumnos.matricula}</td>
                  <td className="whitespace-nowrap px-5 py-4 text-sm capitalize text-slate-600">{assignment.alumnos.nivel} · {assignment.alumnos.grado}° · {assignment.alumnos.grupo}</td>
                  <td className="px-5 py-4 text-sm font-medium text-slate-800">{assignment.becas.nombre}</td>
                  <td className="whitespace-nowrap px-5 py-4 text-sm font-semibold tabular-nums text-slate-900"><span>{Number(assignment.porcentaje_aplicado).toFixed(2)}%</span><span className="ml-2 text-xs font-normal capitalize text-slate-400">{assignment.alcance_aplicado === "ambas" ? "Inscripción y mensualidad" : assignment.alcance_aplicado}</span></td>
                  <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-500">{new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(new Date(assignment.fecha_asignacion))}</td>
                  <td className="px-5 py-4 text-right"><button type="button" onClick={() => setAssignmentToRemove(assignment)} title="Retirar beca" aria-label={`Retirar beca de ${getFullStudentName(assignment.alumnos)}`} className="inline-grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <footer className="flex items-center justify-between border-t border-slate-200 px-5 py-4 text-sm text-slate-500"><p>{total === 0 ? "0 asignaciones" : `${(page - 1) * PAGE_SIZE + 1}-${Math.min(page * PAGE_SIZE, total)} de ${total}`}</p><div className="flex items-center gap-2"><button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1 || isLoading} className="rounded-lg border border-slate-300 px-3 py-2 font-medium text-slate-700 disabled:opacity-40">Anterior</button><span className="min-w-16 text-center text-xs">{page} de {totalPages}</span><button type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages || isLoading} className="rounded-lg border border-slate-300 px-3 py-2 font-medium text-slate-700 disabled:opacity-40">Siguiente</button></div></footer>
      </div>

      {isAssignModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-[2px]">
          <section role="dialog" aria-modal="true" aria-labelledby="assign-scholarship-title" className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between"><div><p className="text-xs font-semibold uppercase tracking-wider text-sky-600">Ciclo {cycle}</p><h2 id="assign-scholarship-title" className="mt-1 text-xl font-bold text-slate-950">Asignar beca</h2></div><button type="button" onClick={() => !isSaving && setIsAssignModalOpen(false)} aria-label="Cerrar" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button></div>
            <form onSubmit={handleAssign} className="mt-6 space-y-5">
              <div><label htmlFor="scholarship-student-search" className="text-sm font-medium text-slate-700">Buscar alumno</label><div className="relative mt-2"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input id="scholarship-student-search" value={studentSearch} onChange={(event) => setStudentSearch(event.target.value)} placeholder="Nombre o matrícula" className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" /></div></div>
              <div><label htmlFor="scholarship-student" className="text-sm font-medium text-slate-700">Alumno</label><select id="scholarship-student" required value={studentId} onChange={(event) => setStudentId(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm"><option value="">Selecciona un alumno</option>{availableStudents.slice(0, 100).map((student) => <option key={student.id} value={student.id}>{getFullStudentName(student)} · {student.matricula}</option>)}</select></div>
              <div><label htmlFor="scholarship-type" className="text-sm font-medium text-slate-700">Beca</label><select id="scholarship-type" required value={scholarshipId} onChange={(event) => setScholarshipId(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm">{scholarships.map((scholarship) => <option key={scholarship.id} value={scholarship.id}>{scholarship.nombre} · {Number(scholarship.porcentaje).toFixed(2)}%</option>)}</select></div>
              <div><label htmlFor="scholarship-observations" className="text-sm font-medium text-slate-700">Observaciones <span className="font-normal text-slate-400">(opcional)</span></label><textarea id="scholarship-observations" maxLength={500} rows={3} value={observations} onChange={(event) => setObservations(event.target.value)} className="mt-2 w-full resize-none rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm" /></div>
              {error && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
              <div className="flex justify-end gap-3"><button type="button" onClick={() => setIsAssignModalOpen(false)} disabled={isSaving} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700">Cancelar</button><button type="submit" disabled={isSaving} className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{isSaving && <LoaderCircle className="h-4 w-4 animate-spin" />}Asignar beca</button></div>
            </form>
          </section>
        </div>
      )}

      {assignmentToRemove && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"><section role="alertdialog" aria-modal="true" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"><h2 className="text-lg font-bold text-slate-950">Retirar beca</h2><p className="mt-2 text-sm leading-6 text-slate-600">Se retirará <strong>{assignmentToRemove.becas.nombre}</strong> de {getFullStudentName(assignmentToRemove.alumnos)} para el ciclo {cycle}.</p><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setAssignmentToRemove(null)} disabled={isSaving} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700">Cancelar</button><button type="button" onClick={() => void removeAssignment()} disabled={isSaving} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{isSaving && <LoaderCircle className="h-4 w-4 animate-spin" />}Retirar</button></div></section></div>}
      {toast && <div role="status" className="fixed bottom-6 right-6 z-[60] rounded-xl bg-emerald-600 px-5 py-3 text-sm font-medium text-white shadow-xl">{toast}</div>}
    </section>
  );
}
