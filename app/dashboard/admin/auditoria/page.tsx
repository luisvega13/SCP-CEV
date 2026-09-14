"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  BadgePercent,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Eye,
  FileClock,
  GraduationCap,
  LoaderCircle,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import type {
  ConsultaAuditoriaAdministrativa,
  EventoAuditoriaAdministrativa,
  TipoEventoAuditoria,
} from "@/types/database";

const PAGE_SIZE = 15;

const eventLabels: Record<TipoEventoAuditoria, string> = {
  pago_modificado: "Pago modificado",
  pago_eliminado: "Pago eliminado",
  beca_asignada: "Beca asignada",
  curp_modificada: "CURP modificada",
  estado_alumno: "Estado académico",
};

const detailLabels: Record<string, string> = {
  pago_id: "ID histórico del pago",
  monto_anterior: "Monto anterior",
  monto_nuevo: "Monto nuevo",
  metodo_anterior: "Método anterior",
  metodo_nuevo: "Método nuevo",
  facturado_anterior: "Factura anterior",
  facturado_nuevo: "Factura nueva",
  monto: "Monto",
  tipo_pago: "Tipo de pago",
  metodo_pago: "Método de pago",
  facturado: "Facturado",
  folio_comprobante: "Folio del comprobante",
  periodo: "Periodo",
  fecha_pago_original: "Fecha original del pago",
  beca: "Beca",
  ciclo_escolar: "Ciclo escolar",
  tipo_descuento: "Tipo de descuento",
  porcentaje: "Porcentaje",
  monto_fijo: "Monto fijo",
  alcance: "Alcance",
  vigencia_desde: "Vigente desde",
  curp_anterior: "CURP anterior",
  curp_nueva: "CURP nueva",
  estado_anterior: "Estado anterior",
  estado_nuevo: "Estado nuevo",
  dato_historico: "Registro histórico",
  nivel: "Nivel",
  grado: "Grado / semestre",
  grupo: "Grupo",
};

const moneyKeys = new Set(["monto_anterior", "monto_nuevo", "monto", "monto_fijo"]);
const dateTimeKeys = new Set(["fecha_pago_original"]);
const dateKeys = new Set(["vigencia_desde"]);
const booleanKeys = new Set(["facturado_anterior", "facturado_nuevo", "facturado", "dato_historico"]);

const dateTimeFormatter = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Mexico_City",
});
const dateFormatter = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "long",
  timeZone: "UTC",
});
const moneyFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

function humanize(value: string) {
  return value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function formatDetailValue(key: string, value: string | number | boolean | null) {
  if (value === null || value === "") return "No disponible";
  if (booleanKeys.has(key)) return value ? "Sí" : "No";
  if (moneyKeys.has(key)) return moneyFormatter.format(Number(value));
  if (dateTimeKeys.has(key)) return dateTimeFormatter.format(new Date(String(value)));
  if (dateKeys.has(key)) return dateFormatter.format(new Date(`${value}T12:00:00Z`));
  if (key === "porcentaje") return `${Number(value)}%`;
  return typeof value === "string" ? humanize(value) : String(value);
}

function eventBadgeClass(type: TipoEventoAuditoria) {
  if (type === "pago_eliminado") return "border-red-200 bg-red-50 text-red-700";
  if (type === "pago_modificado") return "border-amber-200 bg-amber-50 text-amber-700";
  if (type === "beca_asignada") return "border-violet-200 bg-violet-50 text-violet-700";
  return "border-sky-200 bg-sky-50 text-sky-700";
}

export default function AuditPage() {
  const [type, setType] = useState<"todos" | TipoEventoAuditoria>("todos");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [report, setReport] = useState<ConsultaAuditoriaAdministrativa | null>(null);
  const [selected, setSelected] = useState<EventoAuditoriaAdministrativa | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    let active = true;
    async function loadAudit() {
      setIsLoading(true);
      setError("");
      const { data, error: queryError } = await getSupabaseBrowserClient().rpc(
        "consultar_auditoria_administrativa",
        {
          p_tipo_evento: type === "todos" ? null : type,
          p_desde: fromDate || null,
          p_hasta: toDate || null,
          p_busqueda: debouncedSearch,
          p_limite: PAGE_SIZE,
          p_offset: (page - 1) * PAGE_SIZE,
        },
      );
      if (!active) return;
      if (queryError) {
        setReport(null);
        setError(queryError.message);
      } else {
        setReport(data);
      }
      setIsLoading(false);
    }
    void loadAudit();
    return () => { active = false; };
  }, [debouncedSearch, fromDate, page, toDate, type]);

  const totalPages = Math.max(1, Math.ceil((report?.total ?? 0) / PAGE_SIZE));
  const rows = report?.registros ?? [];
  const hasFilters = type !== "todos" || fromDate !== "" || toDate !== "" || search !== "";
  const cards = useMemo(() => [
    { label: "Eventos encontrados", value: report?.total ?? 0, icon: FileClock },
    { label: "Movimientos de pagos", value: report?.pagos ?? 0, icon: CircleDollarSign },
    { label: "Movimientos de becas", value: report?.becas ?? 0, icon: BadgePercent },
    { label: "Cambios de alumnos", value: report?.alumnos ?? 0, icon: GraduationCap },
  ], [report]);

  function clearFilters() {
    setType("todos");
    setFromDate("");
    setToDate("");
    setSearch("");
    setPage(1);
  }

  return (
    <section className="mx-auto max-w-7xl">
      <header>
        <p className="text-sm font-medium text-sky-600">Administración</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">Auditoría del sistema</h1>
        <p className="mt-2 text-sm text-slate-500">Consulta el historial inalterable de operaciones sensibles realizadas en el portal.</p>
      </header>

      <div className="mt-6 flex items-start gap-3 rounded-xl border border-sky-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-sky-600" />
        <p><span className="font-semibold text-slate-800">Bitácora de solo lectura.</span> Estos registros no pueden editarse ni eliminarse desde el sistema.</p>
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[1.4fr_0.8fr_0.8fr_1fr] lg:items-end">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Buscar
            <div className="relative mt-2">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Alumno, CURP, responsable o motivo..." className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3.5 text-sm font-normal normal-case tracking-normal outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" />
            </div>
          </label>
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Desde
            <input type="date" value={fromDate} max={toDate || undefined} onChange={(event) => { setFromDate(event.target.value); setPage(1); }} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-normal text-slate-700 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" />
          </label>
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Hasta
            <input type="date" value={toDate} min={fromDate || undefined} onChange={(event) => { setToDate(event.target.value); setPage(1); }} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-normal text-slate-700 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" />
          </label>
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Tipo de evento
            <select value={type} onChange={(event) => { setType(event.target.value as "todos" | TipoEventoAuditoria); setPage(1); }} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-normal normal-case tracking-normal text-slate-700 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100">
              <option value="todos">Todos los eventos</option>
              {Object.entries(eventLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-4 flex min-h-9 items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <p className="text-xs text-slate-500">Las fechas se interpretan con horario de Ciudad de México.</p>
          {hasFilters && <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"><X className="h-4 w-4" />Limpiar filtros</button>}
        </div>
      </div>

      {error && <p role="alert" className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ label, value, icon: Icon }) => (
          <article key={label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4"><div><p className="text-sm font-medium text-slate-600">{label}</p><p className="mt-3 text-3xl font-bold tabular-nums text-slate-950">{isLoading ? "-" : value}</p></div><Icon className="h-5 w-5 text-slate-400" /></div>
          </article>
        ))}
      </div>

      <div className="mt-6 w-full max-w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm [contain:inline-size]">
        <div className="w-full max-w-full overflow-x-auto overscroll-x-contain">
          <table className="w-full min-w-[1040px] divide-y divide-slate-200">
            <thead className="bg-slate-50"><tr>{["Fecha y hora", "Evento", "Alumno", "Resumen", "Realizado por"].map((heading) => <th key={heading} className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">{heading}</th>)}<th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">Detalle</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && <tr><td colSpan={6} className="px-5 py-14 text-center text-sm text-slate-500"><span className="inline-flex items-center gap-2"><LoaderCircle className="h-4 w-4 animate-spin" />Cargando bitácora...</span></td></tr>}
              {!isLoading && !error && rows.length === 0 && <tr><td colSpan={6} className="px-5 py-14 text-center"><FileClock className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm text-slate-500">No hay eventos que coincidan con los filtros seleccionados.</p></td></tr>}
              {!isLoading && rows.map((row) => (
                <tr key={`${row.tipo_evento}-${row.id}`} className="hover:bg-slate-50/80">
                  <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-600">{dateTimeFormatter.format(new Date(row.fecha))}</td>
                  <td className="whitespace-nowrap px-5 py-4"><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${eventBadgeClass(row.tipo_evento)}`}>{eventLabels[row.tipo_evento]}</span></td>
                  <td className="px-5 py-4"><p className="whitespace-nowrap text-sm font-medium text-slate-950">{row.alumno ?? "No disponible"}</p>{row.matricula && <p className="mt-1 font-mono text-[11px] text-slate-500">{row.matricula}</p>}</td>
                  <td className="max-w-sm px-5 py-4"><p className="text-sm text-slate-700">{row.resumen}</p>{row.motivo && <p className="mt-1 line-clamp-1 text-xs text-slate-500">Motivo: {row.motivo}</p>}</td>
                  <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-600">{row.responsable}</td>
                  <td className="px-5 py-4 text-right"><button type="button" onClick={() => setSelected(row)} aria-label={`Ver detalle de ${eventLabels[row.tipo_evento]}`} className="inline-grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900"><Eye className="h-4 w-4" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <footer className="flex flex-col gap-3 border-t border-slate-200 px-5 py-4 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between"><p>{report?.total ? `Mostrando ${(page - 1) * PAGE_SIZE + 1}-${Math.min(page * PAGE_SIZE, report.total)} de ${report.total} eventos` : "Mostrando 0 eventos"}</p><div className="flex items-center gap-2"><button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1 || isLoading} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 font-medium text-slate-700 disabled:opacity-40"><ChevronLeft className="h-4 w-4" />Anterior</button><span className="min-w-16 text-center text-xs">{page} de {totalPages}</span><button type="button" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={page >= totalPages || isLoading} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 font-medium text-slate-700 disabled:opacity-40">Siguiente<ChevronRight className="h-4 w-4" /></button></div></footer>
      </div>

      {selected && <AuditDetail event={selected} onClose={() => setSelected(null)} />}
    </section>
  );
}

function AuditDetail({ event, onClose }: { event: EventoAuditoriaAdministrativa; onClose: () => void }) {
  const details = Object.entries(event.detalle).filter(([, value]) => value !== null);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="audit-detail-title" className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl">
        <header className="sticky top-0 flex items-start justify-between gap-5 border-b border-slate-200 bg-white px-6 py-5">
          <div><p className="text-xs font-semibold uppercase tracking-wider text-sky-600">Registro inalterable</p><h2 id="audit-detail-title" className="mt-1 text-xl font-bold text-slate-950">{eventLabels[event.tipo_evento]}</h2><p className="mt-1 text-sm text-slate-500">{dateTimeFormatter.format(new Date(event.fecha))}</p></div>
          <button type="button" onClick={onClose} aria-label="Cerrar detalle" className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </header>
        <div className="space-y-5 p-6">
          <div className="grid gap-4 rounded-xl border border-slate-200 p-4 sm:grid-cols-2">
            <div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Alumno</p><p className="mt-1 text-sm font-semibold text-slate-900">{event.alumno ?? "No disponible"}</p>{event.matricula && <p className="mt-1 font-mono text-xs text-slate-500">{event.matricula}</p>}</div>
            <div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Realizado por</p><p className="mt-1 break-all text-sm font-semibold text-slate-900">{event.responsable}</p></div>
          </div>
          <div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Operación</p><p className="mt-1 text-sm text-slate-800">{event.resumen}</p></div>
          {event.motivo && <div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Motivo registrado</p><p className="mt-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700">{event.motivo}</p></div>}
          <div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Datos del evento</p><dl className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200">{details.map(([key, value]) => <div key={key} className="grid gap-1 px-4 py-3 sm:grid-cols-[12rem_1fr] sm:gap-4"><dt className="text-sm text-slate-500">{detailLabels[key] ?? humanize(key)}</dt><dd className="break-words text-sm font-medium text-slate-900">{formatDetailValue(key, value)}</dd></div>)}</dl></div>
          {event.alumno_id && <Link href={`/dashboard/admin/alumnos/${event.alumno_id}`} className="inline-flex text-sm font-semibold text-sky-700 hover:text-sky-800">Ver perfil actual del alumno</Link>}
        </div>
      </section>
    </div>
  );
}
