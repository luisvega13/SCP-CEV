"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  LoaderCircle,
  Mail,
  Pencil,
  Phone,
  Plus,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import type { RelacionTutor, TutorAlumno } from "@/types/database";

type TutorForm = {
  posicion: 1 | 2;
  relacion: RelacionTutor;
  nombre: string;
  telefono: string;
  correo: string;
};

const RELATION_LABELS: Record<RelacionTutor, string> = {
  madre: "Madre",
  padre: "Padre",
  tutor: "Tutor(a)",
};

const fieldClass =
  "mt-2 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100";

function emptyTutor(posicion: 1 | 2): TutorForm {
  return {
    posicion,
    relacion: posicion === 1 ? "madre" : "padre",
    nombre: "",
    telefono: "",
    correo: "",
  };
}

function toForm(tutor: TutorAlumno | undefined, posicion: 1 | 2): TutorForm {
  return tutor
    ? {
        posicion,
        relacion: tutor.relacion,
        nombre: tutor.nombre,
        telefono: tutor.telefono,
        correo: tutor.correo ?? "",
      }
    : emptyTutor(posicion);
}

function getErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return "No fue posible guardar la información de contacto.";
}

export function GuardianSection({ studentId }: { studentId: string }) {
  const [tutors, setTutors] = useState<TutorAlumno[]>([]);
  const [primary, setPrimary] = useState<TutorForm>(emptyTutor(1));
  const [secondary, setSecondary] = useState<TutorForm>(emptyTutor(2));
  const [includeSecondary, setIncludeSecondary] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [message, setMessage] = useState("");

  const loadTutors = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const { data, error: loadError } = await getSupabaseBrowserClient()
        .from("tutores_alumnos")
        .select("*")
        .eq("alumno_id", studentId)
        .order("posicion", { ascending: true });
      if (loadError) throw loadError;
      setTutors(data);
    } catch (caughtError) {
      const message = getErrorMessage(caughtError);
      setError(
        message.includes("tutores_alumnos")
          ? "La sección de tutores todavía no está habilitada. Ejecuta la migración 027 en Supabase."
          : message,
      );
    } finally {
      setIsLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    void loadTutors();
  }, [loadTutors]);

  function openForm() {
    const first = tutors.find((tutor) => tutor.posicion === 1);
    const second = tutors.find((tutor) => tutor.posicion === 2);
    setPrimary(toForm(first, 1));
    setSecondary(toForm(second, 2));
    setIncludeSecondary(Boolean(second));
    setFormError("");
    setMessage("");
    setIsOpen(true);
  }

  function validateTutor(tutor: TutorForm, label: string) {
    if (tutor.nombre.trim().length < 3) return `Captura el nombre completo del ${label}.`;
    const digits = tutor.telefono.replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 15) {
      return `El teléfono del ${label} debe contener entre 10 y 15 dígitos.`;
    }
    if (tutor.correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(tutor.correo.trim())) {
      return `El correo del ${label} no tiene un formato válido.`;
    }
    return "";
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    const primaryError = validateTutor(primary, "contacto principal");
    if (primaryError) return setFormError(primaryError);
    if (includeSecondary) {
      const secondaryError = validateTutor(secondary, "segundo contacto");
      if (secondaryError) return setFormError(secondaryError);
    }

    const payload = [primary, ...(includeSecondary ? [secondary] : [])].map((tutor) => ({
      ...tutor,
      nombre: tutor.nombre.trim(),
      telefono: tutor.telefono.trim(),
      correo: tutor.correo.trim().toLowerCase(),
    }));

    setIsSaving(true);
    try {
      const { error: saveError } = await getSupabaseBrowserClient().rpc(
        "guardar_tutores_alumno",
        { p_alumno_id: studentId, p_tutores: payload },
      );
      if (saveError) throw saveError;
      await loadTutors();
      setIsOpen(false);
      setMessage("Información de contacto actualizada correctamente.");
    } catch (caughtError) {
      setFormError(getErrorMessage(caughtError));
    } finally {
      setIsSaving(false);
    }
  }

  function updateTutor(
    setter: React.Dispatch<React.SetStateAction<TutorForm>>,
    field: keyof Omit<TutorForm, "posicion">,
    value: string,
  ) {
    setter((current) => ({ ...current, [field]: value }));
  }

  return (
    <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <UsersRound className="h-5 w-5 text-sky-600" />
            <h2 className="text-xl font-semibold text-slate-950">Información de tutores</h2>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Contactos autorizados para atender cualquier situación relacionada con el alumno.
          </p>
        </div>
        <button type="button" onClick={openForm} disabled={isLoading || Boolean(error)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50">
          {tutors.length ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {tutors.length ? "Editar contactos" : "Registrar tutor"}
        </button>
      </div>

      {error && <p role="alert" className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</p>}

      {isLoading ? (
        <div className="mt-6 flex min-h-28 items-center justify-center text-sm text-slate-500"><LoaderCircle className="mr-2 h-4 w-4 animate-spin" />Cargando contactos...</div>
      ) : tutors.length === 0 && !error ? (
        <div className="mt-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <div><p className="font-semibold">Falta registrar el contacto obligatorio</p><p className="mt-1 text-xs leading-5">Registra al menos a la madre, padre o tutor responsable del alumno.</p></div>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {tutors.map((tutor) => (
            <article key={tutor.id} className="rounded-xl border border-slate-200 p-5">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500"><UserRound className="h-5 w-5" /></span>
                <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wider text-sky-700">{tutor.posicion === 1 ? "Contacto principal" : "Contacto adicional"}</p><p className="mt-1 truncate font-semibold text-slate-950">{tutor.nombre}</p><p className="mt-0.5 text-xs text-slate-500">{RELATION_LABELS[tutor.relacion]}</p></div>
              </div>
              <div className="mt-4 space-y-2 text-sm">
                <a href={`tel:${tutor.telefono}`} className="flex items-center gap-2 text-slate-700 hover:text-sky-700"><Phone className="h-4 w-4 text-slate-400" />{tutor.telefono}</a>
                {tutor.correo && <a href={`mailto:${tutor.correo}`} className="flex items-center gap-2 break-all text-slate-700 hover:text-sky-700"><Mail className="h-4 w-4 shrink-0 text-slate-400" />{tutor.correo}</a>}
              </div>
            </article>
          ))}
        </div>
      )}

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-[2px]">
          <section role="dialog" aria-modal="true" aria-labelledby="guardian-title" className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl sm:p-8">
            <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-sky-600">Directorio de contacto</p><h3 id="guardian-title" className="mt-1 text-xl font-bold text-slate-950">Tutores del alumno</h3><p className="mt-1 text-sm text-slate-500">El contacto principal es obligatorio. Puedes registrar un segundo contacto.</p></div><button type="button" onClick={() => setIsOpen(false)} disabled={isSaving} aria-label="Cerrar" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button></div>

            <form onSubmit={handleSubmit} className="mt-6 space-y-6">
              <TutorFields title="Contacto principal" required tutor={primary} onChange={(field, value) => updateTutor(setPrimary, field, value)} />

              {includeSecondary ? (
                <div>
                  <div className="mb-3 flex items-center justify-between"><p className="text-sm font-semibold text-slate-900">Segundo contacto <span className="font-normal text-slate-400">(opcional)</span></p><button type="button" onClick={() => { setIncludeSecondary(false); setSecondary(emptyTutor(2)); }} className="text-xs font-semibold text-red-600 hover:text-red-700">Quitar segundo contacto</button></div>
                  <TutorFields tutor={secondary} onChange={(field, value) => updateTutor(setSecondary, field, value)} />
                </div>
              ) : (
                <button type="button" onClick={() => setIncludeSecondary(true)} className="inline-flex items-center gap-2 rounded-lg border border-dashed border-slate-300 px-4 py-3 text-sm font-semibold text-slate-600 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700"><Plus className="h-4 w-4" />Agregar segundo contacto</button>
              )}

              {formError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{formError}</p>}
              <div className="flex justify-end gap-3 border-t border-slate-200 pt-5"><button type="button" onClick={() => setIsOpen(false)} disabled={isSaving} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancelar</button><button type="submit" disabled={isSaving} className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60">{isSaving && <LoaderCircle className="h-4 w-4 animate-spin" />}{isSaving ? "Guardando..." : "Guardar contactos"}</button></div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}

function TutorFields({ title, tutor, onChange }: { title?: string; required?: boolean; tutor: TutorForm; onChange: (field: keyof Omit<TutorForm, "posicion">, value: string) => void }) {
  return (
    <fieldset className="grid gap-4 rounded-xl border border-slate-200 p-5 sm:grid-cols-2">
      {title && <legend className="px-2 text-sm font-semibold text-slate-900">{title} <span className="font-normal text-slate-400">(obligatorio)</span></legend>}
      <label className="text-sm font-medium text-slate-700">Relación con el alumno *<select required value={tutor.relacion} onChange={(event) => onChange("relacion", event.target.value as RelacionTutor)} className={fieldClass}><option value="madre">Madre</option><option value="padre">Padre</option><option value="tutor">Tutor(a)</option></select></label>
      <label className="text-sm font-medium text-slate-700">Nombre completo *<input required maxLength={150} value={tutor.nombre} onChange={(event) => onChange("nombre", event.target.value)} className={fieldClass} placeholder="Nombre y apellidos" /></label>
      <label className="text-sm font-medium text-slate-700">Teléfono *<input required type="tel" inputMode="tel" maxLength={25} value={tutor.telefono} onChange={(event) => onChange("telefono", event.target.value)} className={fieldClass} placeholder="10 dígitos" /></label>
      <label className="text-sm font-medium text-slate-700">Correo <span className="font-normal text-slate-400">(opcional)</span><input type="email" maxLength={254} value={tutor.correo} onChange={(event) => onChange("correo", event.target.value)} className={fieldClass} placeholder="correo@ejemplo.com" /></label>
    </fieldset>
  );
}
