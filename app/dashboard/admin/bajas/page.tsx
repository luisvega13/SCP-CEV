"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Archive,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  LoaderCircle,
  Mars,
  Search,
  Users,
  Venus,
} from "lucide-react";
import {
  ACADEMIC_LEVEL_LABELS,
  getAcademicGradeLabel,
  getCurrentAcademicCycle,
} from "@/lib/academic";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import type {
  ConsultaBajasAlumnos,
  NivelEscolar,
} from "@/types/database";

const PAGE_SIZE = 10;
const selectClass = "mt-2 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-700 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100";

const dateFormatter = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "America/Mexico_City",
});

function cycleFromStart(startYear: number) {
  return `${startYear}-${startYear + 1}`;
}

function fullName(row: ConsultaBajasAlumnos["registros"][number]) {
  return [row.nombre, row.apellido_paterno, row.apellido_materno]
    .filter(Boolean)
    .join(" ");
}

export default function WithdrawnStudentsPage() {
  const currentCycle = getCurrentAcademicCycle();
  const [cycle, setCycle] = useState(currentCycle);
  const [withdrawalType, setWithdrawalType] = useState<"todos" | "baja" | "pausa">("todos");
  const [level, setLevel] = useState<"todos" | NivelEscolar>("todos");
  const [grade, setGrade] = useState("todos");
  const [group, setGroup] = useState("todos");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [report, setReport] = useState<ConsultaBajasAlumnos | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState<"current" | "history" | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    let active = true;
    async function loadReport() {
      setIsLoading(true);
      setError("");
      const { data, error: queryError } = await getSupabaseBrowserClient().rpc(
        "consultar_bajas_alumnos",
        {
          p_ciclo_escolar: cycle,
          p_tipo_baja: withdrawalType === "todos" ? null : withdrawalType,
          p_nivel: level === "todos" ? null : level,
          p_grado: grade === "todos" ? null : Number(grade),
          p_grupo: group === "todos" ? null : group,
          p_busqueda: debouncedSearch,
          p_limite: PAGE_SIZE,
          p_offset: (page - 1) * PAGE_SIZE,
        },
      );
      if (!active) return;
      if (queryError) {
        setError(queryError.message);
        setReport(null);
      } else {
        setReport(data);
      }
      setIsLoading(false);
    }
    void loadReport();
    return () => {
      active = false;
    };
  }, [cycle, debouncedSearch, grade, group, level, page, withdrawalType]);

  const totalPages = Math.max(1, Math.ceil((report?.total ?? 0) / PAGE_SIZE));
  const rows = report?.registros ?? [];
  const availableGrades = report?.grados_disponibles ?? [];
  const availableGroups = report?.grupos_disponibles ?? [];
  const cards = useMemo(() => [
    { label: "Total de bajas y pausas", value: report?.total ?? 0, icon: Users },
    { label: "Hombres con baja o pausa", value: report?.hombres ?? 0, icon: Mars },
    { label: "Mujeres con baja o pausa", value: report?.mujeres ?? 0, icon: Venus },
  ], [report]);

  function moveCycle(direction: -1 | 1) {
    const startYear = Number(cycle.split("-")[0]);
    setCycle(cycleFromStart(startYear + direction));
    setPage(1);
    setWithdrawalType("todos");
    setLevel("todos");
    setGrade("todos");
    setGroup("todos");
  }

  async function downloadCsv(history = false) {
    setIsDownloading(history ? "history" : "current");
    setError("");
    try {
      const params = new URLSearchParams({ cycle });
      if (withdrawalType !== "todos") params.set("type", withdrawalType);
      if (history) params.set("history", "true");
      if (level !== "todos") params.set("level", level);
      if (grade !== "todos") params.set("grade", grade);
      if (group !== "todos") params.set("group", group);
      if (debouncedSearch) params.set("search", debouncedSearch);
      const response = await fetch(`/api/admin/exports/withdrawn-students?${params}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(result?.error || "No fue posible generar el reporte CSV.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = history
        ? `historial-bajas-y-reactivaciones-${cycle}.csv`
        : `bajas-y-pausas-${cycle}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "No fue posible descargar el reporte.");
    } finally {
      setIsDownloading(null);
    }
  }

  return (
    <section className="mx-auto max-w-7xl">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-sky-600">Administración académica</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">Bajas y pausas temporales</h1>
          <p className="mt-2 text-sm text-slate-500">Consulta las bajas definitivas y pausas temporales por ciclo escolar.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="button" onClick={() => void downloadCsv(false)} disabled={isLoading || isDownloading !== null} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
            {isDownloading === "current" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Descargar listado actual
          </button>
          <button type="button" onClick={() => void downloadCsv(true)} disabled={isLoading || isDownloading !== null} className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50">
            {isDownloading === "history" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Descargar historial completo
          </button>
        </div>
      </header>

      <div className="mt-7 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[auto_1fr] lg:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Ciclo escolar</p>
            <div className="mt-2 inline-flex items-stretch overflow-hidden rounded-lg border border-slate-300 bg-white" role="group" aria-label="Navegación de ciclo escolar">
              <button type="button" onClick={() => moveCycle(-1)} disabled={isLoading} aria-label="Ciclo anterior" className="grid w-11 place-items-center border-r border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"><ChevronLeft className="h-5 w-5" /></button>
              <div className="min-w-40 px-5 py-2 text-center"><p className="font-semibold tabular-nums text-slate-950">{cycle}</p><p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">{cycle === currentCycle ? "Ciclo actual" : "Agosto - Julio"}</p></div>
              <button type="button" onClick={() => moveCycle(1)} disabled={isLoading} aria-label="Ciclo siguiente" className="grid w-11 place-items-center border-l border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"><ChevronRight className="h-5 w-5" /></button>
            </div>
          </div>
          <div className="relative">
            <label htmlFor="withdrawal-search" className="text-xs font-semibold uppercase tracking-wider text-slate-500">Buscar alumno</label>
            <div className="relative mt-2"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input id="withdrawal-search" type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Matrícula (CURP), nombre o apellidos..." className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3.5 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" /></div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Tipo de baja<select value={withdrawalType} onChange={(event) => { setWithdrawalType(event.target.value as "todos" | "baja" | "pausa"); setGrade("todos"); setGroup("todos"); setPage(1); }} className={selectClass}><option value="todos">Bajas y pausas</option><option value="baja">Baja definitiva</option><option value="pausa">Pausa temporal</option></select></label>
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Nivel<select value={level} onChange={(event) => { setLevel(event.target.value as "todos" | NivelEscolar); setGrade("todos"); setGroup("todos"); setPage(1); }} className={selectClass}><option value="todos">Todos los niveles</option>{Object.entries(ACADEMIC_LEVEL_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Grado / semestre<select value={grade} onChange={(event) => { setGrade(event.target.value); setGroup("todos"); setPage(1); }} className={selectClass}><option value="todos">Todos los grados</option>{availableGrades.map((value) => <option key={value} value={value}>{level === "todos" ? `${value}°` : getAcademicGradeLabel(level, value)}</option>)}</select></label>
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Grupo<select value={group} onChange={(event) => { setGroup(event.target.value); setPage(1); }} className={selectClass}><option value="todos">Todos los grupos</option>{availableGroups.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        </div>
      </div>

      {error && <p role="alert" className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {cards.map(({ label, value, icon: Icon }) => (
          <article key={label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4"><div><p className="text-sm font-medium text-slate-600">{label}</p><p className="mt-3 text-3xl font-bold tabular-nums text-slate-950">{isLoading ? "-" : value}</p></div><Icon className="h-5 w-5 text-slate-400" /></div>
          </article>
        ))}
      </div>

      <div className="mt-6 w-full max-w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm [contain:inline-size]">
        <div className="w-full max-w-full overflow-x-auto overscroll-x-contain">
          <table className="min-w-[1080px] w-full divide-y divide-slate-200">
            <thead className="bg-slate-50"><tr>{["Fecha del movimiento", "Tipo de baja", "Alumno", "Matrícula (CURP)", "Sexo", "Nivel / Grado / Grupo"].map((heading) => <th key={heading} className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">{heading}</th>)}<th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">Acción</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && <tr><td colSpan={7} className="px-5 py-14 text-center text-sm text-slate-500"><span className="inline-flex items-center gap-2"><LoaderCircle className="h-4 w-4 animate-spin" />Cargando bajas y pausas...</span></td></tr>}
              {!isLoading && !error && rows.length === 0 && <tr><td colSpan={7} className="px-5 py-14 text-center"><Archive className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm text-slate-500">No hay bajas ni pausas que coincidan con los filtros seleccionados.</p></td></tr>}
              {!isLoading && rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/80">
                  <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-600">{row.fecha_baja ? dateFormatter.format(new Date(row.fecha_baja)) : <span className="text-xs text-slate-400">Fecha no disponible</span>}</td>
                  <td className="whitespace-nowrap px-5 py-4 text-sm"><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${row.tipo_baja === "baja" ? "border-red-200 bg-red-50 text-red-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>{row.tipo_baja === "baja" ? "Baja definitiva" : "Pausa temporal"}</span></td>
                  <td className="whitespace-nowrap px-5 py-4 text-sm font-medium text-slate-950">{fullName(row)}</td>
                  <td className="whitespace-nowrap px-5 py-4 font-mono text-xs font-semibold text-slate-600">{row.matricula}</td>
                  <td className="whitespace-nowrap px-5 py-4 text-sm capitalize text-slate-600">{row.sexo}</td>
                  <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-600">{ACADEMIC_LEVEL_LABELS[row.nivel]} · {getAcademicGradeLabel(row.nivel, row.grado)} · Grupo {row.grupo}</td>
                  <td className="px-5 py-4 text-right"><Link href={`/dashboard/admin/alumnos/${row.alumno_id}`} title="Ver perfil del alumno" aria-label={`Ver perfil de ${fullName(row)}`} className="inline-grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900"><Eye className="h-4 w-4" /></Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <footer className="flex flex-col gap-3 border-t border-slate-200 px-5 py-4 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between"><p>{report?.total ? `Mostrando ${(page - 1) * PAGE_SIZE + 1}-${Math.min(page * PAGE_SIZE, report.total)} de ${report.total} bajas` : "Mostrando 0 bajas"}</p><div className="flex items-center gap-2"><button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1 || isLoading} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 font-medium text-slate-700 disabled:opacity-40"><ChevronLeft className="h-4 w-4" />Anterior</button><span className="min-w-16 text-center text-xs">{page} de {totalPages}</span><button type="button" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={page >= totalPages || isLoading} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 font-medium text-slate-700 disabled:opacity-40">Siguiente<ChevronRight className="h-4 w-4" /></button></div></footer>
      </div>
    </section>
  );
}
