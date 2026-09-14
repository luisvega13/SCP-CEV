"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { LoaderCircle, MessageCircleMore, RotateCcw } from "lucide-react";
import { invalidateAdminData, loadWhatsAppReminderTemplate } from "@/lib/admin-data";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import {
  DEFAULT_WHATSAPP_REMINDER_TEMPLATE,
  renderWhatsAppReminderTemplate,
  WHATSAPP_REMINDER_VARIABLES,
} from "@/lib/whatsapp-template";

const MAX_TEMPLATE_LENGTH = 4000;

const previewValues = {
  tutorName: "María López",
  studentName: "Juan Pérez Hernández",
  totalAmount: "$4,900.00",
  debtDetail:
    "• Mensualidad Agosto 2026: $2,450.00 (venció el 10/08/2026)\n• Mensualidad Septiembre 2026: $2,450.00 (venció el 10/09/2026)",
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }
  return "No fue posible guardar la plantilla de WhatsApp.";
}

export function WhatsAppTemplateSettings() {
  const [template, setTemplate] = useState(DEFAULT_WHATSAPP_REMINDER_TEMPLATE);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let isMounted = true;
    loadWhatsAppReminderTemplate()
      .then((value) => {
        if (isMounted) setTemplate(value);
      })
      .catch((caughtError) => {
        if (isMounted) setError(getErrorMessage(caughtError));
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  function insertVariable(token: string) {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? template.length;
    const end = textarea?.selectionEnd ?? start;
    const nextTemplate = `${template.slice(0, start)}${token}${template.slice(end)}`;
    if (nextTemplate.length > MAX_TEMPLATE_LENGTH) return;
    setTemplate(nextTemplate);
    setMessage("");
    window.requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  async function saveTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = template.trim();
    setError("");
    setMessage("");
    if (!normalized) {
      setError("El mensaje no puede quedar vacío.");
      return;
    }

    setIsSaving(true);
    try {
      const { data, error: saveError } = await getSupabaseBrowserClient().rpc(
        "actualizar_plantilla_recordatorio_whatsapp",
        { p_plantilla: normalized },
      );
      if (saveError) throw saveError;
      setTemplate(data);
      invalidateAdminData("configurations:whatsapp-template");
      setMessage("Plantilla de WhatsApp guardada correctamente.");
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
    } finally {
      setIsSaving(false);
    }
  }

  const preview = renderWhatsAppReminderTemplate(template, previewValues);

  return (
    <section className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700">
          <MessageCircleMore className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-slate-950">
            Mensaje de recordatorio por WhatsApp
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Personaliza el mensaje enviado desde Reportes. Inserta las variables con un clic y colócalas donde prefieras.
          </p>
        </div>
      </div>

      <form onSubmit={saveTemplate} className="mt-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Variables disponibles
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {WHATSAPP_REMINDER_VARIABLES.map((variable) => (
            <button
              key={variable.token}
              type="button"
              disabled={isLoading || isSaving}
              onClick={() => insertVariable(variable.token)}
              className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 transition hover:border-sky-300 hover:bg-sky-100 disabled:opacity-50"
              title={`Insertar ${variable.token}`}
            >
              + {variable.label}
            </button>
          ))}
        </div>

        <label htmlFor="whatsapp-reminder-template" className="mt-5 block text-sm font-medium text-slate-700">
          Texto del mensaje
        </label>
        <textarea
          ref={textareaRef}
          id="whatsapp-reminder-template"
          rows={10}
          maxLength={MAX_TEMPLATE_LENGTH}
          disabled={isLoading || isSaving}
          value={template}
          onChange={(event) => {
            setTemplate(event.target.value);
            setMessage("");
          }}
          className="mt-2 w-full resize-y rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-sm leading-6 text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100 disabled:bg-slate-100"
        />
        <div className="mt-2 flex flex-col gap-2 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>Puedes mover, repetir o eliminar cualquier variable.</p>
          <p className="tabular-nums">{template.length} / {MAX_TEMPLATE_LENGTH}</p>
        </div>

        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Vista previa</p>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{preview}</p>
        </div>

        {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        {message && <p role="status" className="mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</p>}

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <button
            type="submit"
            disabled={isLoading || isSaving || !template.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {isSaving ? "Guardando..." : "Guardar mensaje"}
          </button>
          <button
            type="button"
            disabled={isLoading || isSaving}
            onClick={() => {
              setTemplate(DEFAULT_WHATSAPP_REMINDER_TEMPLATE);
              setError("");
              setMessage("Mensaje predeterminado restaurado. Guarda para aplicar el cambio.");
            }}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Restaurar predeterminado
          </button>
        </div>
      </form>
    </section>
  );
}
