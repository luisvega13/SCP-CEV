"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  GraduationCap,
  LoaderCircle,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import type { AlcanceBeca, Beca } from "@/types/database";

type EditorState = { mode: "new"; scholarship: null } | { mode: "edit"; scholarship: Beca } | null;

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function ScholarshipConfigurationPage() {
  const [scholarships, setScholarships] = useState<Beca[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [editor, setEditor] = useState<EditorState>(null);
  const [name, setName] = useState("");
  const [percentage, setPercentage] = useState("");
  const [description, setDescription] = useState("");
  const [scope, setScope] = useState<AlcanceBeca>("mensualidad");
  const [isActive, setIsActive] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [scholarshipToDelete, setScholarshipToDelete] = useState<Beca | null>(null);

  const loadScholarships = useCallback(async () => {
    setIsLoading(true);
    setError("");
    const { data, error: queryError } = await getSupabaseBrowserClient()
      .from("becas")
      .select("*")
      .order("activa", { ascending: false })
      .order("nombre");
    if (queryError) {
      setError(queryError.message);
      setScholarships([]);
    } else {
      setScholarships(data);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void loadScholarships();
  }, [loadScholarships]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 5_000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  function openEditor(nextEditor: Exclude<EditorState, null>) {
    setEditor(nextEditor);
    setName(nextEditor.scholarship?.nombre ?? "");
    setPercentage(nextEditor.scholarship ? String(nextEditor.scholarship.porcentaje) : "");
    setDescription(nextEditor.scholarship?.descripcion ?? "");
    setScope(nextEditor.scholarship?.alcance ?? "mensualidad");
    setIsActive(nextEditor.scholarship?.activa ?? true);
    setError("");
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) return;
    const normalizedName = name.trim().replace(/\s+/g, " ");
    const numericPercentage = Number(percentage);
    if (normalizedName.length < 3) {
      setError("El nombre debe contener al menos 3 caracteres.");
      return;
    }
    if (!Number.isFinite(numericPercentage) || numericPercentage <= 0 || numericPercentage > 100) {
      setError("El porcentaje debe ser mayor a 0 y menor o igual a 100.");
      return;
    }

    setIsSaving(true);
    setError("");
    try {
      const supabase = getSupabaseBrowserClient();
      const values = {
        nombre: normalizedName,
        porcentaje: Math.round(numericPercentage * 100) / 100,
        alcance: scope,
        descripcion: description.trim(),
        activa: isActive,
      };
      const result = editor.mode === "new"
        ? await supabase.from("becas").insert(values).select("*").single()
        : await supabase.from("becas").update(values).eq("id", editor.scholarship.id).select("*").single();
      if (result.error) throw result.error;
      setEditor(null);
      setToast(editor.mode === "new" ? "Beca creada correctamente." : "Beca actualizada correctamente.");
      await loadScholarships();
    } catch (caughtError) {
      const message = getErrorMessage(caughtError, "No fue posible guardar la beca.");
      setError(message.includes("duplicate key") ? "Ya existe una beca con este nombre." : message);
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteScholarship() {
    if (!scholarshipToDelete) return;
    setIsSaving(true);
    setError("");
    try {
      const { error: deleteError } = await getSupabaseBrowserClient()
        .from("becas")
        .delete()
        .eq("id", scholarshipToDelete.id);
      if (deleteError) throw deleteError;
      setScholarshipToDelete(null);
      setToast("Beca eliminada correctamente.");
      await loadScholarships();
    } catch (caughtError) {
      const message = getErrorMessage(caughtError, "No fue posible eliminar la beca.");
      setError(message.includes("foreign key") ? "No se puede eliminar porque está asignada a uno o más alumnos. Puedes marcarla como inactiva." : message);
      setScholarshipToDelete(null);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="mx-auto max-w-6xl">
      <Link href="/dashboard/admin/becas" className="inline-flex items-center gap-2 text-sm font-medium text-sky-600 hover:text-sky-800"><ArrowLeft className="h-4 w-4" />Volver a becas</Link>
      <header className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-sm font-medium text-sky-600">Becas</p><h1 className="mt-1 text-3xl font-bold text-slate-950">Configuración de becas</h1><p className="mt-2 text-sm text-slate-500">Crea y administra los tipos de beca disponibles para asignación.</p></div>
        <button type="button" onClick={() => openEditor({ mode: "new", scholarship: null })} className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700"><Plus className="h-4 w-4" />Nueva beca</button>
      </header>

      {error && !editor && <p role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {isLoading && Array.from({ length: 3 }, (_, index) => <div key={index} className="h-48 animate-pulse rounded-xl border border-slate-200 bg-white p-6"><div className="h-5 w-32 rounded bg-slate-200" /><div className="mt-4 h-8 w-20 rounded bg-slate-200" /></div>)}
        {!isLoading && scholarships.length === 0 && <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center md:col-span-2 xl:col-span-3"><GraduationCap className="mx-auto h-9 w-9 text-slate-300" /><p className="mt-3 text-sm text-slate-500">Aún no hay becas configuradas.</p></div>}
        {!isLoading && scholarships.map((scholarship) => (
          <article key={scholarship.id} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2"><h2 className="font-semibold text-slate-950">{scholarship.nombre}</h2><span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${scholarship.activa ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{scholarship.activa ? "Activa" : "Inactiva"}</span></div><p className="mt-3 text-3xl font-bold tabular-nums text-sky-700">{Number(scholarship.porcentaje).toFixed(2)}%</p></div><GraduationCap className="h-6 w-6 text-sky-300" /></div>
            <p className="mt-3 text-xs font-medium capitalize text-sky-700">Aplica a: {scholarship.alcance === "ambas" ? "Inscripción y mensualidades" : scholarship.alcance}</p><p className="mt-3 min-h-10 text-sm leading-5 text-slate-500">{scholarship.descripcion || "Sin descripción."}</p>
            <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={() => openEditor({ mode: "edit", scholarship })} title="Editar beca" aria-label={`Editar ${scholarship.nombre}`} className="inline-grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"><Pencil className="h-4 w-4" /></button><button type="button" onClick={() => setScholarshipToDelete(scholarship)} title="Eliminar beca" aria-label={`Eliminar ${scholarship.nombre}`} className="inline-grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button></div>
          </article>
        ))}
      </div>

      {editor && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-[2px]"><section role="dialog" aria-modal="true" aria-labelledby="scholarship-editor-title" className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between"><div><p className="text-xs font-semibold uppercase tracking-wider text-sky-600">Catálogo de becas</p><h2 id="scholarship-editor-title" className="mt-1 text-xl font-bold text-slate-950">{editor.mode === "new" ? "Nueva beca" : "Modificar beca"}</h2></div><button type="button" onClick={() => !isSaving && setEditor(null)} aria-label="Cerrar" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button></div><form onSubmit={handleSave} className="mt-6 space-y-5"><div><label htmlFor="scholarship-name" className="text-sm font-medium text-slate-700">Nombre</label><input id="scholarship-name" required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej. Beca académica" className="mt-2 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm" /></div><div><label htmlFor="scholarship-percentage" className="text-sm font-medium text-slate-700">Porcentaje</label><div className="relative mt-2"><input id="scholarship-percentage" type="number" min="0.01" max="100" step="0.01" required value={percentage} onChange={(event) => setPercentage(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 pr-10 text-sm" /><span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-slate-500">%</span></div></div><div><label htmlFor="scholarship-scope" className="text-sm font-medium text-slate-700">Aplicar descuento a</label><select id="scholarship-scope" required value={scope} onChange={(event) => setScope(event.target.value as AlcanceBeca)} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm"><option value="mensualidad">Mensualidades</option><option value="inscripcion">Inscripción</option><option value="ambas">Inscripción y mensualidades</option></select></div><div><label htmlFor="scholarship-description" className="text-sm font-medium text-slate-700">Descripción</label><textarea id="scholarship-description" maxLength={500} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} className="mt-2 w-full resize-none rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm" /></div><label className="flex items-center gap-3 rounded-lg border border-slate-200 p-4"><input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-sky-600" /><span><span className="block text-sm font-medium text-slate-800">Disponible para asignación</span><span className="mt-0.5 block text-xs text-slate-500">Las becas inactivas conservan sus asignaciones históricas.</span></span></label>{error && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}<div className="flex justify-end gap-3"><button type="button" onClick={() => setEditor(null)} disabled={isSaving} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700">Cancelar</button><button type="submit" disabled={isSaving} className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{isSaving && <LoaderCircle className="h-4 w-4 animate-spin" />}Guardar beca</button></div></form></section></div>}

      {scholarshipToDelete && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"><section role="alertdialog" aria-modal="true" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"><h2 className="text-lg font-bold text-slate-950">Eliminar beca</h2><p className="mt-2 text-sm leading-6 text-slate-600">¿Deseas eliminar <strong>{scholarshipToDelete.nombre}</strong>? Si tiene alumnos asignados, deberás marcarla como inactiva.</p><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setScholarshipToDelete(null)} disabled={isSaving} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700">Cancelar</button><button type="button" onClick={() => void deleteScholarship()} disabled={isSaving} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{isSaving && <LoaderCircle className="h-4 w-4 animate-spin" />}Eliminar</button></div></section></div>}
      {toast && <div role="status" className="fixed bottom-6 right-6 z-[60] rounded-xl bg-emerald-600 px-5 py-3 text-sm font-medium text-white shadow-xl">{toast}</div>}
    </section>
  );
}
