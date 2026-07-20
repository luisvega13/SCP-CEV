"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Archive,
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  CheckCircle2,
  CircleAlert,
  CircleCheck,
  CircleDollarSign,
  Eye,
  PauseCircle,
  Pencil,
  Search,
  UserPlus,
  X,
} from "lucide-react";
import {
  QuickPaymentModal,
  StudentDrawer,
} from "@/components/StudentDirectoryDialogs";
import { TableSkeletonRows } from "@/components/TableSkeletonRows";
import { getFullStudentName } from "@/lib/academic";
import {
  invalidateAdminData,
  loadStudentFilterOptions,
  loadStudents,
  type StudentListItem,
} from "@/lib/admin-data";
import type { EstadoAlumno, StudentFilterOptions } from "@/types/database";

const PAGE_SIZE = 10;

type SortKey = "matricula" | "nombre" | "trayectoria" | "estado";
type SortDirection = "asc" | "desc";
type DrawerState =
  | { mode: "new"; student: null }
  | { mode: "edit"; student: StudentListItem }
  | null;

const statusPresentation: Record<
  EstadoAlumno,
  { label: string; icon: typeof CircleCheck; className: string }
> = {
  activo: {
    label: "Cursando activamente",
    icon: CircleCheck,
    className: "text-slate-600",
  },
  pausa: {
    label: "Pausa temporal",
    icon: PauseCircle,
    className: "text-slate-400",
  },
  baja: {
    label: "Baja definitiva",
    icon: Archive,
    className: "text-slate-500",
  },
};

const selectClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-700 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100";

function SortableHeading({
  label,
  sortKey,
  activeSort,
  direction,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  activeSort: SortKey;
  direction: SortDirection;
  onSort: (key: SortKey) => void;
}) {
  const isActive = activeSort === sortKey;

  return (
    <th scope="col" className="px-5 py-3.5 text-left">
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        aria-label={`Ordenar por ${label}`}
        className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-600 transition hover:text-slate-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
      >
        {label}
        <ChevronsUpDown
          aria-hidden="true"
          className={`h-3.5 w-3.5 ${isActive ? "text-sky-600" : "text-slate-300"}`}
        />
        {isActive && <span className="sr-only">{direction === "asc" ? "ascendente" : "descendente"}</span>}
      </button>
    </th>
  );
}

export default function StudentsPage() {
  const [students, setStudents] = useState<StudentListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState("todos");
  const [gradeFilter, setGradeFilter] = useState("todos");
  const [groupFilter, setGroupFilter] = useState("todos");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [sortKey, setSortKey] = useState<SortKey>("nombre");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalStudents, setTotalStudents] = useState(0);
  const [filterOptions, setFilterOptions] = useState<StudentFilterOptions>({
    grados: [],
    grupos: [],
  });
  const [paymentStudent, setPaymentStudent] =
    useState<StudentListItem | null>(null);
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const [toast, setToast] = useState("");

  const refetchStudents = useCallback(async (showLoading = false) => {
    if (showLoading) setIsLoading(true);
    setError(null);
    try {
      const data = await loadStudents({
        page: currentPage,
        pageSize: PAGE_SIZE,
        search: debouncedSearch,
        level: levelFilter,
        grade: gradeFilter,
        group: groupFilter,
        academicStatus: statusFilter,
        sortKey,
        sortDirection,
      });
      setStudents(data.students);
      setTotalStudents(data.total);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "No fue posible cargar el directorio de alumnos.",
      );
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, [currentPage, debouncedSearch, gradeFilter, groupFilter, levelFilter, sortDirection, sortKey, statusFilter]);

  useEffect(() => {
    void refetchStudents(true);
  }, [refetchStudents]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    let mounted = true;
    loadStudentFilterOptions()
      .then((options) => {
        if (mounted) setFilterOptions(options);
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 8_000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  async function handleMutationSuccess(message: string) {
    invalidateAdminData("students:");
    await refetchStudents();
    setToast(message);
  }

  const availableGrades = filterOptions.grados.filter((grade) =>
    levelFilter === "primaria" ? grade <= 6 : grade <= 3,
  );
  const availableGroups = filterOptions.grupos;
  const totalPages = Math.max(1, Math.ceil(totalStudents / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * PAGE_SIZE;
  const visibleStudents = students;

  function resetPage() {
    setCurrentPage(1);
  }

  function handleSort(nextSort: SortKey) {
    if (nextSort === sortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(nextSort);
      setSortDirection("asc");
    }
    resetPage();
  }

  return (
    <section className="mx-auto max-w-7xl">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-sky-600">Administración académica</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">Alumnos</h1>
          <p className="mt-2 text-sm text-slate-500">Consulta, organiza y administra el directorio institucional.</p>
        </div>
        <button type="button" onClick={() => setDrawer({ mode: "new", student: null })} className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2">
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          Nuevo alumno
        </button>
      </header>

      <div className="mt-7 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <label htmlFor="student-search" className="sr-only">Buscar alumnos</label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input id="student-search" type="search" value={search} onChange={(event) => { setSearch(event.target.value); resetPage(); }} placeholder="Buscar por nombre, apellido o matrícula..." className="w-full rounded-xl border border-slate-300 bg-slate-50 py-3 pl-12 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:bg-white focus:ring-2 focus:ring-sky-100" />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Nivel
            <select value={levelFilter} onChange={(event) => { setLevelFilter(event.target.value); setGradeFilter("todos"); setGroupFilter("todos"); resetPage(); }} className={`mt-2 ${selectClass}`}>
              <option value="todos">Todos los niveles</option>
              <option value="primaria">Primaria</option>
              <option value="secundaria">Secundaria</option>
              <option value="bachillerato">Bachillerato</option>
            </select>
          </label>
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Grado
            <select value={gradeFilter} onChange={(event) => { setGradeFilter(event.target.value); setGroupFilter("todos"); resetPage(); }} className={`mt-2 ${selectClass}`}>
              <option value="todos">Todos los grados</option>
              {availableGrades.map((grade) => <option key={grade} value={grade}>{grade}°</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Grupo
            <select value={groupFilter} onChange={(event) => { setGroupFilter(event.target.value); resetPage(); }} className={`mt-2 ${selectClass}`}>
              <option value="todos">Todos los grupos</option>
              {availableGroups.map((group) => <option key={group} value={group}>{group}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Estado académico
            <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); resetPage(); }} className={`mt-2 ${selectClass}`}>
              <option value="todos">Todos los estados</option>
              <option value="activo">Activo</option>
              <option value="pausa">Pausa temporal</option>
              <option value="baja">Baja definitiva</option>
            </select>
          </label>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <SortableHeading label="Matrícula" sortKey="matricula" activeSort={sortKey} direction={sortDirection} onSort={handleSort} />
                <SortableHeading label="Nombre completo" sortKey="nombre" activeSort={sortKey} direction={sortDirection} onSort={handleSort} />
                <SortableHeading label="Nivel / Grado / Grupo" sortKey="trayectoria" activeSort={sortKey} direction={sortDirection} onSort={handleSort} />
                <SortableHeading label="Estado académico" sortKey="estado" activeSort={sortKey} direction={sortDirection} onSort={handleSort} />
                <th scope="col" className="px-5 py-3.5 text-center text-xs font-semibold uppercase tracking-wider text-slate-600">Finanzas</th>
                <th scope="col" className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && <TableSkeletonRows columns={6} label="Cargando directorio de alumnos..." />}
              {!isLoading && error && <tr><td colSpan={6} className="px-6 py-12 text-center text-sm text-red-600">{error}</td></tr>}
              {!isLoading && !error && visibleStudents.length === 0 && <tr><td colSpan={6} className="px-6 py-12 text-center text-sm text-slate-500">No se encontraron alumnos con estos criterios.</td></tr>}
              {!isLoading && !error && visibleStudents.map((student) => {
                const status = statusPresentation[student.estado];
                const StatusIcon = status.icon;
                const hasDebt = student.deuda_mensualidad > 0 || student.deuda_inscripcion > 0;
                const fullName = getFullStudentName(student);
                return (
                  <tr key={student.id} className="transition-colors hover:bg-slate-50/80">
                    <td className="whitespace-nowrap px-5 py-4 font-mono text-xs font-semibold tracking-wide text-slate-700">{student.matricula}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-sm font-medium text-slate-950">{fullName}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-sm capitalize text-slate-600">{student.nivel} · {student.grado}° · Grupo {student.grupo}</td>
                    <td className="px-5 py-4 text-center">
                      <span title={status.label} aria-label={status.label} className={`inline-flex ${status.className}`}><StatusIcon className="h-5 w-5" aria-hidden="true" /><span className="sr-only">{status.label}</span></span>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <span title={hasDebt ? "Tiene saldo pendiente" : "Al corriente"} aria-label={hasDebt ? "Tiene saldo pendiente" : "Al corriente"} className={hasDebt ? "text-amber-600/80" : "text-slate-400"}>
                        {hasDebt ? <CircleAlert className="inline h-5 w-5" aria-hidden="true" /> : <BadgeCheck className="inline h-5 w-5" aria-hidden="true" />}
                        <span className="sr-only">{hasDebt ? "Tiene saldo pendiente" : "Al corriente"}</span>
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-right">
                      <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
                        <Link href={`/dashboard/admin/alumnos/${student.id}`} title="Ver perfil completo" aria-label={`Ver perfil de ${fullName}`} className="rounded-md p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"><Eye className="h-4 w-4" aria-hidden="true" /></Link>
                        <button type="button" onClick={() => setPaymentStudent(student)} disabled={student.estado !== "activo"} title={student.estado === "activo" ? "Registrar pago rápido" : "Los pagos están bloqueados para alumnos inactivos"} aria-label={`Registrar pago para ${fullName}`} className="rounded-md p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-30"><CircleDollarSign className="h-4 w-4" aria-hidden="true" /></button>
                        <button type="button" onClick={() => setDrawer({ mode: "edit", student })} title="Editar información" aria-label={`Editar información de ${fullName}`} className="rounded-md p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"><Pencil className="h-4 w-4" aria-hidden="true" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <footer className="flex flex-col gap-3 border-t border-slate-200 px-5 py-4 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>{totalStudents === 0 ? "Mostrando 0 alumnos" : `Mostrando ${startIndex + 1}-${Math.min(startIndex + visibleStudents.length, totalStudents)} de ${totalStudents} alumnos`}</p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={safePage === 1 || isLoading} aria-label="Página anterior" className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft className="h-4 w-4" aria-hidden="true" />Anterior</button>
            <span className="min-w-20 text-center text-xs font-medium text-slate-500">{safePage} de {totalPages}</span>
            <button type="button" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={safePage === totalPages || isLoading} aria-label="Página siguiente" className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">Siguiente<ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
          </div>
        </footer>
      </div>

      {paymentStudent && (
        <QuickPaymentModal
          student={paymentStudent}
          onClose={() => setPaymentStudent(null)}
          onSuccess={handleMutationSuccess}
        />
      )}

      {drawer && (
        <StudentDrawer
          mode={drawer.mode}
          student={drawer.student}
          onClose={() => setDrawer(null)}
          onSuccess={handleMutationSuccess}
        />
      )}

      {toast && (
        <div role="status" aria-live="polite" className="fixed bottom-5 right-5 z-[60] flex max-w-md items-start gap-3 rounded-xl border border-emerald-200 bg-white p-4 text-sm text-slate-700 shadow-xl">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
          <p className="flex-1 leading-5">{toast}</p>
          <button type="button" onClick={() => setToast("")} aria-label="Cerrar notificación" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4" /></button>
        </div>
      )}
    </section>
  );
}
