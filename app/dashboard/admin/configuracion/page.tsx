"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  X,
} from "lucide-react";
import { getCurrentAcademicCycle } from "@/lib/academic";
import {
  invalidateAdminData,
  loadConfigurations as fetchConfigurations,
} from "@/lib/admin-data";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import type {
  ConfiguracionCostos,
  NivelEscolar,
} from "@/types/database";

const currencyFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

const fieldClass =
  "mt-2 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500";

const levels: NivelEscolar[] = ["primaria", "secundaria", "bachillerato"];

function createAcademicCycle(startYear: number) {
  return `${startYear}-${startYear + 1}`;
}

function defaultEnrollmentDeadline(cycle: string) {
  return `${cycle.split("-")[0]}-08-31`;
}

export default function ConfigurationPage() {
  const currentCycle = getCurrentAcademicCycle();
  const [level, setLevel] = useState<NivelEscolar>("primaria");
  const [enrollmentCost, setEnrollmentCost] = useState("");
  const [monthlyCost, setMonthlyCost] = useState("");
  const [cycle, setCycle] = useState(getCurrentAcademicCycle);
  const [enrollmentDeadline, setEnrollmentDeadline] = useState(() =>
    defaultEnrollmentDeadline(getCurrentAcademicCycle()),
  );
  const [configurations, setConfigurations] = useState<
    ConfiguracionCostos[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [paymentLocks, setPaymentLocks] = useState<Record<NivelEscolar, boolean>>({
    primaria: false,
    secundaria: false,
    bachillerato: false,
  });
  const [isCheckingLocks, setIsCheckingLocks] = useState(true);
  const [pendingCosts, setPendingCosts] = useState<{
    enrollment: number;
    monthly: number;
    deadline: string;
  } | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadConfigurations() {
      try {
        const supabase = getSupabaseBrowserClient();
        const [data, lockResults] = await Promise.all([
          fetchConfigurations(cycle),
          Promise.all(
            levels.map((itemLevel) =>
              supabase.rpc("existen_pagos_nivel_ciclo", {
                p_nivel: itemLevel,
                p_ciclo_escolar: cycle,
              }),
            ),
          ),
        ]);
        const lockError = lockResults.find((result) => result.error)?.error;
        if (lockError) throw lockError;
        if (isMounted) {
          setConfigurations(data);
          setPaymentLocks({
            primaria: Boolean(lockResults[0].data),
            secundaria: Boolean(lockResults[1].data),
            bachillerato: Boolean(lockResults[2].data),
          });
          const selected = data.find((item) => item.nivel === level);
          setEnrollmentCost(selected ? String(selected.costo_inscripcion) : "");
          setMonthlyCost(selected ? String(selected.costo_mensualidad) : "");
          setEnrollmentDeadline(
            selected?.fecha_limite_inscripcion ?? defaultEnrollmentDeadline(cycle),
          );
        }
      } catch (caughtError) {
        if (isMounted) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "No fue posible cargar la configuración.",
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
          setIsCheckingLocks(false);
        }
      }
    }

    setIsLoading(true);
    setIsCheckingLocks(true);
    void loadConfigurations();
    return () => {
      isMounted = false;
    };
  }, [cycle, level]);

  function selectConfiguration(selectedLevel: NivelEscolar) {
    setLevel(selectedLevel);
    const existing = configurations.find(
      (configuration) => configuration.nivel === selectedLevel,
    );
    setEnrollmentCost(
      existing ? String(existing.costo_inscripcion) : "",
    );
    setMonthlyCost(existing ? String(existing.costo_mensualidad) : "");
    setEnrollmentDeadline(
      existing?.fecha_limite_inscripcion ?? defaultEnrollmentDeadline(cycle),
    );
    setError("");
    setMessage("");
  }

  function selectCycle(selectedCycle: string) {
    setCycle(selectedCycle);
    setEnrollmentDeadline(defaultEnrollmentDeadline(selectedCycle));
    setIsCheckingLocks(true);
    setError("");
    setMessage("");
    setPendingCosts(null);
  }

  function moveCycle(direction: -1 | 1) {
    const startYear = Number(cycle.split("-")[0]);
    selectCycle(createAcademicCycle(startYear + direction));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const enrollment = Number(enrollmentCost);
    const monthly = Number(monthlyCost);

    setError("");
    setMessage("");

    if (
      !Number.isFinite(enrollment) ||
      !Number.isFinite(monthly) ||
      enrollment < 0 ||
      monthly < 0
    ) {
      setError("Ingresa costos válidos mayores o iguales a cero.");
      return;
    }

    if (!/^\d{4}-\d{4}$/.test(cycle)) {
      setError("El ciclo escolar debe tener el formato AAAA-AAAA.");
      return;
    }

    if (
      enrollmentDeadline < `${cycle.split("-")[0]}-08-01` ||
      enrollmentDeadline > `${cycle.split("-")[0]}-08-31`
    ) {
      setError("Selecciona una fecha límite dentro de agosto del inicio del ciclo escolar.");
      return;
    }

    if (paymentLocks[level]) {
      setError("No se pueden modificar los costos porque ya existen pagos registrados en este ciclo");
      return;
    }

    setPendingCosts({ enrollment, monthly, deadline: enrollmentDeadline });
  }

  async function confirmSave() {
    if (!pendingCosts) return;

    setIsSaving(true);
    setPendingCosts(null);

    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error: rpcError } = await supabase.rpc(
        "actualizar_configuracion_escolar",
        {
          p_nivel: level,
          p_costo_inscripcion: pendingCosts.enrollment,
          p_costo_mensualidad: pendingCosts.monthly,
          p_ciclo_escolar: cycle,
          p_fecha_limite_inscripcion: pendingCosts.deadline,
        },
      );

      if (rpcError) throw rpcError;

      invalidateAdminData("configurations:");
      invalidateAdminData("dashboard:");
      invalidateAdminData("reports:");
      setConfigurations((current) => [
        ...current.filter(
          (configuration) => configuration.nivel !== data.nivel,
        ),
        data,
      ]);
      setMessage(
        "Costos y fecha límite guardados; las deudas fueron recalculadas correctamente.",
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "No fue posible guardar la configuración.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="mx-auto max-w-5xl">
      <div>
        <p className="text-sm font-medium text-sky-600">Administración</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-950">
          Configuración de costos
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Define costos y la fecha límite de inscripción para el ciclo agosto–julio.
        </p>
      </div>

      <div className="mt-8">
        <p
          id="cycle-label"
          className="text-sm font-medium text-slate-700"
        >
          Ciclo escolar
        </p>
        <div
          role="group"
          aria-labelledby="cycle-label"
          className="mt-2 inline-flex items-stretch overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm"
        >
          <button
            type="button"
            onClick={() => moveCycle(-1)}
            disabled={isSaving || isCheckingLocks}
            aria-label="Ir al ciclo escolar anterior"
            title="Ciclo anterior"
            className="grid w-12 place-items-center border-r border-slate-200 text-slate-600 transition hover:bg-slate-50 hover:text-sky-700 focus:z-10 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <div className="min-w-44 px-5 py-2.5 text-center">
            <p className="text-base font-semibold tabular-nums text-slate-950">
              {cycle}
            </p>
            <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wider text-slate-500">
              {cycle === currentCycle ? "Ciclo actual" : "Agosto — Julio"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => moveCycle(1)}
            disabled={isSaving || isCheckingLocks}
            aria-label="Ir al ciclo escolar siguiente"
            title="Ciclo siguiente"
            className="grid w-12 place-items-center border-l border-slate-200 text-slate-600 transition hover:bg-slate-50 hover:text-sky-700 focus:z-10 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Usa las flechas para navegar entre ciclos escolares.
        </p>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {levels.map(
          (itemLevel) => {
            const configuration = configurations.find(
              (item) => item.nivel === itemLevel,
            );
            return (
              <button
                key={itemLevel}
                type="button"
                onClick={() => selectConfiguration(itemLevel)}
                className={`rounded-xl border p-5 text-left shadow-sm transition ${
                  level === itemLevel
                    ? "border-sky-400 bg-sky-50 ring-2 ring-sky-100"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <p className="font-semibold capitalize text-slate-950">
                  {itemLevel}
                </p>
                {isLoading ? (
                  <div className="mt-3 space-y-2" role="status">
                    <div className="h-4 w-32 animate-pulse rounded bg-slate-200" />
                    <div className="h-4 w-36 animate-pulse rounded bg-slate-200" />
                    <span className="sr-only">Cargando costos...</span>
                  </div>
                ) : configuration ? (
                  <div className="mt-3 space-y-1 text-sm text-slate-600">
                    <p>
                      Inscripción:{" "}
                      {currencyFormatter.format(
                        configuration.costo_inscripcion,
                      )}
                    </p>
                    <p>
                      Mensualidad:{" "}
                      {currencyFormatter.format(
                        configuration.costo_mensualidad,
                      )}
                    </p>
                    <p>
                      Fecha límite: {new Intl.DateTimeFormat("es-MX", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        timeZone: "UTC",
                      }).format(new Date(`${configuration.fecha_limite_inscripcion}T12:00:00Z`))}
                    </p>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-amber-700">
                    Sin configurar
                  </p>
                )}
              </button>
            );
          },
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="mt-8 grid gap-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:grid-cols-2"
      >
        <div className="sm:col-span-2">
          <h2 className="text-lg font-semibold capitalize text-slate-950">
            Costos de {level}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Al guardar se recalcularán las deudas y se aplicará la regla de inscripción del nivel.
          </p>
          {paymentLocks[level] && (
            <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              No se pueden modificar los costos porque ya existen pagos registrados en este ciclo
            </p>
          )}
        </div>
        <div>
          <label
            htmlFor="enrollmentCost"
            className="text-sm font-medium text-slate-700"
          >
            Costo de inscripción
          </label>
          <input
            id="enrollmentCost"
            type="number"
            min="0"
            step="0.01"
            required
            disabled={paymentLocks[level] || isCheckingLocks}
            value={enrollmentCost}
            onChange={(event) => setEnrollmentCost(event.target.value)}
            className={fieldClass}
          />
        </div>
        <div>
          <label
            htmlFor="monthlyCost"
            className="text-sm font-medium text-slate-700"
          >
            Costo de mensualidad
          </label>
          <input
            id="monthlyCost"
            type="number"
            min="0"
            step="0.01"
            required
            disabled={paymentLocks[level] || isCheckingLocks}
            value={monthlyCost}
            onChange={(event) => setMonthlyCost(event.target.value)}
            className={fieldClass}
          />
        </div>

        <div className="sm:col-span-2">
          <label
            htmlFor="enrollmentDeadline"
            className="text-sm font-medium text-slate-700"
          >
            Fecha límite de inscripción
          </label>
          <input
            id="enrollmentDeadline"
            type="date"
            required
            min={`${cycle.split("-")[0]}-08-01`}
            max={`${cycle.split("-")[0]}-08-31`}
            disabled={paymentLocks[level] || isCheckingLocks}
            value={enrollmentDeadline}
            onChange={(event) => setEnrollmentDeadline(event.target.value)}
            className={fieldClass}
          />
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Al terminar este día, los alumnos de {level} que no hayan liquidado la inscripción pasarán automáticamente a pausa.
          </p>
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 sm:col-span-2"
          >
            {error}
          </p>
        )}
        {message && (
          <p
            role="status"
            className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700 sm:col-span-2"
          >
            {message}
          </p>
        )}

        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={isSaving || isCheckingLocks || paymentLocks[level]}
            className="rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? "Guardando y recalculando..." : "Guardar costos"}
          </button>
        </div>
      </form>

      {pendingCosts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-[2px]" role="presentation">
          <section role="alertdialog" aria-modal="true" aria-labelledby="critical-confirmation-title" className="w-full max-w-lg rounded-2xl border border-red-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div className="flex gap-3">
                <span className="rounded-full bg-red-100 p-2 text-red-700"><AlertTriangle className="h-6 w-6" /></span>
                <div>
                  <h2 id="critical-confirmation-title" className="text-lg font-bold text-red-900">Acción destructiva</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-700">⚠️ Acción destructiva: Cambiar los costos recalculará las deudas de todos los alumnos de este nivel. ¿Deseas proceder?</p>
                </div>
              </div>
              <button type="button" onClick={() => setPendingCosts(null)} aria-label="Cerrar confirmación" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setPendingCosts(null)} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancelar</button>
              <button type="button" onClick={() => void confirmSave()} disabled={isSaving} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">{isSaving && <LoaderCircle className="h-4 w-4 animate-spin" />}Sí, recalcular deudas</button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
