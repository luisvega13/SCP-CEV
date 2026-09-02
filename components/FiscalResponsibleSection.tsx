"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  Check,
  ClipboardCopy,
  Copy,
  FileCheck2,
  LoaderCircle,
  Mail,
  Pencil,
  Plus,
  ReceiptText,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import type {
  AlumnoResponsableFiscal,
  CatalogoRegimenFiscal,
  CatalogoUsoCfdi,
  RelacionResponsableFiscal,
  ResponsableFiscal,
  TipoPersonaFiscal,
} from "@/types/database";

type FiscalRelation = AlumnoResponsableFiscal & {
  responsables_fiscales: ResponsableFiscal;
};

type FiscalForm = {
  responsibleId: string | null;
  personType: TipoPersonaFiscal;
  relationship: RelacionResponsableFiscal;
  rfc: string;
  legalName: string;
  postalCode: string;
  taxRegime: string;
  cfdiUse: string;
  billingEmail: string;
  isDefault: boolean;
};

const EMPTY_FORM: FiscalForm = {
  responsibleId: null,
  personType: "fisica",
  relationship: "madre",
  rfc: "",
  legalName: "",
  postalCode: "",
  taxRegime: "605",
  cfdiUse: "D10",
  billingEmail: "",
  isDefault: true,
};

const RELATIONSHIP_LABELS: Record<RelacionResponsableFiscal, string> = {
  madre: "Madre",
  padre: "Padre",
  tutor: "Tutor(a)",
  alumno: "El propio alumno",
  empresa: "Empresa",
  otro: "Otro",
};

const fieldClass =
  "mt-2 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100";

function getErrorMessage(error: unknown, fallback: string) {
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

async function writeClipboard(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("No fue posible copiar el dato.");
}

function CopyButton({
  value,
  copyKey,
  copiedKey,
  onCopy,
}: {
  value: string;
  copyKey: string;
  copiedKey: string;
  onCopy: (value: string, key: string) => void;
}) {
  const copied = copiedKey === copyKey;
  return (
    <button
      type="button"
      onClick={() => onCopy(value, copyKey)}
      aria-label={copied ? "Dato copiado" : `Copiar ${value}`}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
        copied
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-slate-200 bg-white text-slate-500 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
      }`}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copiado" : "Copiar"}
    </button>
  );
}

function FiscalDatum({
  label,
  value,
  copyKey,
  copiedKey,
  onCopy,
  secondary,
}: {
  label: string;
  value: string;
  copyKey: string;
  copiedKey: string;
  onCopy: (value: string, key: string) => void;
  secondary?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <div className="mt-1.5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words text-sm font-semibold text-slate-950">{value}</p>
          {secondary && <p className="mt-1 text-xs leading-5 text-slate-500">{secondary}</p>}
        </div>
        <CopyButton value={value} copyKey={copyKey} copiedKey={copiedKey} onCopy={onCopy} />
      </div>
    </div>
  );
}

export function FiscalResponsibleSection({ studentId }: { studentId: string }) {
  const [relations, setRelations] = useState<FiscalRelation[]>([]);
  const [regimes, setRegimes] = useState<CatalogoRegimenFiscal[]>([]);
  const [cfdiUses, setCfdiUses] = useState<CatalogoUsoCfdi[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [message, setMessage] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState<FiscalForm>(EMPTY_FORM);
  const [copiedKey, setCopiedKey] = useState("");

  const loadFiscalData = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const supabase = getSupabaseBrowserClient();
      const [relationsResult, regimesResult, usesResult] = await Promise.all([
        supabase
          .from("alumnos_responsables_fiscales")
          .select("*, responsables_fiscales(*)")
          .eq("alumno_id", studentId)
          .order("es_predeterminado", { ascending: false })
          .order("created_at", { ascending: true }),
        supabase
          .from("catalogo_regimenes_fiscales")
          .select("*")
          .eq("activo", true)
          .order("clave"),
        supabase
          .from("catalogo_usos_cfdi")
          .select("*")
          .eq("activo", true)
          .order("clave"),
      ]);
      if (relationsResult.error) throw relationsResult.error;
      if (regimesResult.error) throw regimesResult.error;
      if (usesResult.error) throw usesResult.error;
      if (regimesResult.data.length === 0 || usesResult.data.length === 0) {
        throw new Error(
          "Los catálogos existen, pero la sesión actual no recibió filas. Ejecuta la migración 023 para corregir sus políticas RLS.",
        );
      }
      setRelations(relationsResult.data as unknown as FiscalRelation[]);
      setRegimes(regimesResult.data);
      setCfdiUses(usesResult.data);
    } catch (caughtError) {
      setError(getErrorMessage(caughtError, "No fue posible cargar la información fiscal."));
    } finally {
      setIsLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    void loadFiscalData();
  }, [loadFiscalData]);

  useEffect(() => {
    if (!copiedKey) return;
    const timeout = window.setTimeout(() => setCopiedKey(""), 2_000);
    return () => window.clearTimeout(timeout);
  }, [copiedKey]);

  const availableRegimes = useMemo(
    () => regimes.filter((item) => form.personType === "fisica" ? item.aplica_fisica : item.aplica_moral),
    [form.personType, regimes],
  );
  const availableUses = useMemo(
    () => cfdiUses.filter((item) => form.personType === "fisica" ? item.aplica_fisica : item.aplica_moral),
    [cfdiUses, form.personType],
  );
  const catalogsReady = regimes.length > 0 && cfdiUses.length > 0;
  const expectedRfcLength = form.personType === "fisica" ? 13 : 12;

  function openNew() {
    if (!catalogsReady) {
      setError(
        "No se puede registrar información fiscal hasta que la sesión pueda leer los catálogos SAT. Ejecuta la migración 023 en Supabase.",
      );
      return;
    }
    setForm({ ...EMPTY_FORM, isDefault: relations.length === 0 });
    setFormError("");
    setIsModalOpen(true);
  }

  function openEdit(relation: FiscalRelation) {
    const responsible = relation.responsables_fiscales;
    setForm({
      responsibleId: responsible.id,
      personType: responsible.tipo_persona,
      relationship: relation.relacion,
      rfc: responsible.rfc,
      legalName: responsible.nombre_razon_social,
      postalCode: responsible.codigo_postal_fiscal,
      taxRegime: responsible.regimen_fiscal,
      cfdiUse: responsible.uso_cfdi_predeterminado,
      billingEmail: responsible.correo_facturacion ?? "",
      isDefault: relation.es_predeterminado,
    });
    setFormError("");
    setIsModalOpen(true);
  }

  function changePersonType(personType: TipoPersonaFiscal) {
    setForm((current) => ({
      ...current,
      personType,
      taxRegime: personType === "fisica" ? "605" : "601",
      cfdiUse: personType === "fisica" ? "D10" : "G03",
    }));
  }

  async function copyValue(value: string, key: string) {
    try {
      await writeClipboard(value);
      setCopiedKey(key);
    } catch (caughtError) {
      setError(getErrorMessage(caughtError, "No fue posible copiar el dato."));
    }
  }

  async function copyAll(relation: FiscalRelation) {
    const responsible = relation.responsables_fiscales;
    const value = [
      `RFC: ${responsible.rfc}`,
      `Nombre o razón social: ${responsible.nombre_razon_social}`,
      `Código postal fiscal: ${responsible.codigo_postal_fiscal}`,
      `Régimen fiscal: ${responsible.regimen_fiscal}`,
      `Uso CFDI: ${responsible.uso_cfdi_predeterminado}`,
      responsible.correo_facturacion ? `Correo: ${responsible.correo_facturacion}` : null,
    ].filter(Boolean).join("\n");
    await copyValue(value, `${responsible.id}:all`);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    const normalizedRfc = form.rfc.toUpperCase().replace(/[\s-]/g, "");
    const rfcPattern = form.personType === "fisica"
      ? /^[A-ZÑ&]{4}[0-9]{6}[A-Z0-9]{3}$/
      : /^[A-ZÑ&]{3}[0-9]{6}[A-Z0-9]{3}$/;
    if (!rfcPattern.test(normalizedRfc)) {
      setFormError(
        form.personType === "fisica"
          ? "RFC inválido: una persona física debe usar 13 caracteres con formato AAAA######XXX. Captúralo como aparece en la Constancia de Situación Fiscal."
          : "RFC inválido: una persona moral debe usar 12 caracteres con formato AAA######XXX. Captúralo como aparece en la Constancia de Situación Fiscal.",
      );
      return;
    }
    if (!/^\d{5}$/.test(form.postalCode)) {
      setFormError("El código postal fiscal debe contener exactamente 5 números.");
      return;
    }
    if (!form.taxRegime || !form.cfdiUse) {
      setFormError("Selecciona el régimen fiscal y el uso de CFDI.");
      return;
    }

    setIsSaving(true);
    try {
      const { error: saveError } = await getSupabaseBrowserClient().rpc(
        "guardar_responsable_fiscal_alumno",
        {
          p_alumno_id: studentId,
          p_responsable_id: form.responsibleId,
          p_tipo_persona: form.personType,
          p_rfc: normalizedRfc,
          p_nombre_razon_social: form.legalName.toUpperCase().trim(),
          p_codigo_postal_fiscal: form.postalCode,
          p_regimen_fiscal: form.taxRegime,
          p_uso_cfdi: form.cfdiUse,
          p_correo_facturacion: form.billingEmail.trim(),
          p_relacion: form.relationship,
          p_es_predeterminado: form.isDefault,
        },
      );
      if (saveError) throw saveError;
      setIsModalOpen(false);
      setMessage(form.responsibleId ? "Información fiscal actualizada correctamente." : "Responsable fiscal registrado correctamente.");
      await loadFiscalData();
    } catch (caughtError) {
      const message = getErrorMessage(caughtError, "No fue posible guardar la información fiscal.");
      setFormError(
        message.includes("responsables_fiscales_rfc_check")
          ? `El RFC no tiene el formato válido para una persona ${form.personType}. Verifica el dato en la Constancia de Situación Fiscal.`
          : message,
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ReceiptText className="h-5 w-5 text-sky-600" />
            <h2 className="text-xl font-semibold text-slate-950">Información fiscal</h2>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Datos del receptor para emitir CFDI 4.0 en el portal externo de facturación.
          </p>
        </div>
        <button type="button" onClick={openNew} disabled={isLoading || !catalogsReady} title={!catalogsReady && !isLoading ? "Los catálogos fiscales no están disponibles" : undefined} className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50">
          <Plus className="h-4 w-4" />Registrar responsable
        </button>
      </div>

      <div className="mt-5 flex items-start gap-3 rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-xs leading-5 text-sky-800">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <p>Captura los valores exactamente como aparecen en la Constancia de Situación Fiscal.</p>
      </div>

      {error && <div role="alert" className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><p className="font-semibold">No se pudieron cargar los catálogos fiscales</p><p className="mt-1">{error}</p></div>}
      {message && <p role="status" className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</p>}

      {isLoading ? (
        <div className="mt-6 flex min-h-32 items-center justify-center text-sm text-slate-500"><LoaderCircle className="mr-2 h-4 w-4 animate-spin" />Cargando información fiscal...</div>
      ) : relations.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-slate-300 px-6 py-10 text-center">
          <FileCheck2 className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 text-sm font-semibold text-slate-700">Sin información fiscal registrada</p>
          <p className="mt-1 text-xs text-slate-500">Registra al responsable que solicitará las facturas del alumno.</p>
        </div>
      ) : (
        <div className="mt-6 space-y-5">
          {relations.map((relation) => {
            const responsible = relation.responsables_fiscales;
            const regime = regimes.find((item) => item.clave === responsible.regimen_fiscal);
            const cfdiUse = cfdiUses.find((item) => item.clave === responsible.uso_cfdi_predeterminado);
            return (
              <article key={relation.id} className="overflow-hidden rounded-2xl border border-slate-200">
                <header className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-slate-500 shadow-sm ring-1 ring-slate-200">
                      {responsible.tipo_persona === "fisica" ? <UserRound className="h-5 w-5" /> : <Building2 className="h-5 w-5" />}
                    </span>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-bold text-slate-950">{RELATIONSHIP_LABELS[relation.relacion]}</p>
                        {relation.es_predeterminado && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Predeterminado</span>}
                      </div>
                      <p className="mt-0.5 text-xs capitalize text-slate-500">Persona {responsible.tipo_persona}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => void copyAll(relation)} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                      {copiedKey === `${responsible.id}:all` ? <Check className="h-4 w-4 text-emerald-600" /> : <ClipboardCopy className="h-4 w-4" />}
                      {copiedKey === `${responsible.id}:all` ? "Todo copiado" : "Copiar todos"}
                    </button>
                    <button type="button" onClick={() => openEdit(relation)} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Pencil className="h-4 w-4" />Editar</button>
                  </div>
                </header>
                <div className="grid gap-3 p-5 md:grid-cols-2">
                  <FiscalDatum label="RFC" value={responsible.rfc} copyKey={`${responsible.id}:rfc`} copiedKey={copiedKey} onCopy={(value, key) => void copyValue(value, key)} />
                  <FiscalDatum label="Nombre / razón social" value={responsible.nombre_razon_social} copyKey={`${responsible.id}:name`} copiedKey={copiedKey} onCopy={(value, key) => void copyValue(value, key)} />
                  <FiscalDatum label="Código postal fiscal" value={responsible.codigo_postal_fiscal} copyKey={`${responsible.id}:cp`} copiedKey={copiedKey} onCopy={(value, key) => void copyValue(value, key)} />
                  <FiscalDatum label="Régimen fiscal" value={responsible.regimen_fiscal} secondary={regime?.descripcion} copyKey={`${responsible.id}:regime`} copiedKey={copiedKey} onCopy={(value, key) => void copyValue(value, key)} />
                  <FiscalDatum label="Uso de CFDI" value={responsible.uso_cfdi_predeterminado} secondary={cfdiUse?.descripcion} copyKey={`${responsible.id}:use`} copiedKey={copiedKey} onCopy={(value, key) => void copyValue(value, key)} />
                  {responsible.correo_facturacion && <FiscalDatum label="Correo de facturación" value={responsible.correo_facturacion} copyKey={`${responsible.id}:email`} copiedKey={copiedKey} onCopy={(value, key) => void copyValue(value, key)} />}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-[2px]" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="fiscal-form-title" className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-sky-600">Expediente CFDI 4.0</p>
                <h3 id="fiscal-form-title" className="mt-1 text-xl font-bold text-slate-950">{form.responsibleId ? "Editar responsable fiscal" : "Registrar responsable fiscal"}</h3>
                <p className="mt-1 text-sm text-slate-500">Todos los campos marcados son necesarios para facturar.</p>
              </div>
              <button type="button" onClick={() => setIsModalOpen(false)} disabled={isSaving} aria-label="Cerrar" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>

            <form onSubmit={handleSubmit} className="mt-6 grid gap-5 sm:grid-cols-2">
              <label className="text-sm font-medium text-slate-700">Tipo de persona *
                <select value={form.personType} onChange={(event) => changePersonType(event.target.value as TipoPersonaFiscal)} className={fieldClass}>
                  <option value="fisica">Persona física</option><option value="moral">Persona moral</option>
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700">Relación con el alumno *
                <select value={form.relationship} onChange={(event) => setForm((current) => ({ ...current, relationship: event.target.value as RelacionResponsableFiscal }))} className={fieldClass}>
                  {Object.entries(RELATIONSHIP_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700">RFC *
                <input required minLength={expectedRfcLength} maxLength={expectedRfcLength} value={form.rfc} onChange={(event) => setForm((current) => ({ ...current, rfc: event.target.value.toUpperCase().replace(/[^A-ZÑ&0-9]/g, "") }))} placeholder={form.personType === "fisica" ? "ABCD001122XYZ" : "ABC001122XYZ"} className={`${fieldClass} font-mono uppercase`} />
                <span className="mt-1.5 block text-xs text-slate-500">{form.personType === "fisica" ? "13 caracteres: 4 letras, fecha de 6 dígitos y homoclave." : "12 caracteres: 3 letras, fecha de 6 dígitos y homoclave."}</span>
              </label>
              <label className="text-sm font-medium text-slate-700">Código postal fiscal *
                <input required inputMode="numeric" maxLength={5} pattern="[0-9]{5}" value={form.postalCode} onChange={(event) => setForm((current) => ({ ...current, postalCode: event.target.value.replace(/\D/g, "").slice(0, 5) }))} placeholder="00000" className={fieldClass} />
              </label>
              <label className="text-sm font-medium text-slate-700 sm:col-span-2">Nombre, denominación o razón social *
                <input required maxLength={254} value={form.legalName} onChange={(event) => setForm((current) => ({ ...current, legalName: event.target.value.toUpperCase() }))} placeholder="COMO APARECE EN LA CONSTANCIA FISCAL" className={`${fieldClass} uppercase`} />
                <span className="mt-1.5 block text-xs text-slate-500">Respeta números, espacios y signos de puntuación de la constancia.</span>
              </label>
              <label className="text-sm font-medium text-slate-700">Régimen fiscal *
                <select required value={form.taxRegime} onChange={(event) => setForm((current) => ({ ...current, taxRegime: event.target.value }))} className={fieldClass}>
                  <option value="">{availableRegimes.length === 0 ? "Catálogo no disponible" : "Selecciona un régimen"}</option>
                  {availableRegimes.map((item) => <option key={item.clave} value={item.clave}>{item.clave} — {item.descripcion}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700">Uso de CFDI predeterminado *
                <select required value={form.cfdiUse} onChange={(event) => setForm((current) => ({ ...current, cfdiUse: event.target.value }))} className={fieldClass}>
                  <option value="">{availableUses.length === 0 ? "Catálogo no disponible" : "Selecciona un uso"}</option>
                  {availableUses.map((item) => <option key={item.clave} value={item.clave}>{item.clave} — {item.descripcion}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700 sm:col-span-2">Correo de facturación <span className="font-normal text-slate-400">(opcional)</span>
                <div className="relative"><Mail className="pointer-events-none absolute left-3 top-5 h-4 w-4 text-slate-400" /><input type="email" maxLength={254} value={form.billingEmail} onChange={(event) => setForm((current) => ({ ...current, billingEmail: event.target.value }))} placeholder="facturacion@correo.com" className={`${fieldClass} pl-10`} /></div>
              </label>
              <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-4 text-sm text-slate-700 sm:col-span-2">
                <input type="checkbox" checked={form.isDefault} onChange={(event) => setForm((current) => ({ ...current, isDefault: event.target.checked }))} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500" />
                <span><strong className="block text-slate-900">Responsable predeterminado</strong><span className="mt-1 block text-xs leading-5 text-slate-500">Se mostrará primero al preparar una factura para este alumno.</span></span>
              </label>
              {formError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:col-span-2">{formError}</p>}
              <div className="flex justify-end gap-3 border-t border-slate-200 pt-5 sm:col-span-2">
                <button type="button" onClick={() => setIsModalOpen(false)} disabled={isSaving} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancelar</button>
                <button type="submit" disabled={isSaving} className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60">{isSaving && <LoaderCircle className="h-4 w-4 animate-spin" />}{isSaving ? "Guardando..." : "Guardar información fiscal"}</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
