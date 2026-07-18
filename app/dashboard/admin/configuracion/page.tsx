"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
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
  "mt-2 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100";

export default function ConfigurationPage() {
  const [level, setLevel] = useState<NivelEscolar>("primaria");
  const [enrollmentCost, setEnrollmentCost] = useState("");
  const [monthlyCost, setMonthlyCost] = useState("");
  const [cycle, setCycle] = useState(getCurrentAcademicCycle);
  const [configurations, setConfigurations] = useState<
    ConfiguracionCostos[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadConfigurations() {
      try {
        const data = await fetchConfigurations(cycle);
        if (isMounted) setConfigurations(data);
      } catch (caughtError) {
        if (isMounted) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "No fue posible cargar la configuración.",
          );
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    setIsLoading(true);
    void loadConfigurations();
    return () => {
      isMounted = false;
    };
  }, [cycle]);

  function selectConfiguration(selectedLevel: NivelEscolar) {
    setLevel(selectedLevel);
    const existing = configurations.find(
      (configuration) => configuration.nivel === selectedLevel,
    );
    setEnrollmentCost(
      existing ? String(existing.costo_inscripcion) : "",
    );
    setMonthlyCost(existing ? String(existing.costo_mensualidad) : "");
    setError("");
    setMessage("");
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

    setIsSaving(true);

    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error: rpcError } = await supabase.rpc(
        "actualizar_configuracion_costos",
        {
          p_nivel: level,
          p_costo_inscripcion: enrollment,
          p_costo_mensualidad: monthly,
          p_ciclo_escolar: cycle,
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
        "Costos guardados y deudas del nivel recalculadas correctamente.",
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
          Define inscripción y mensualidad para el ciclo agosto–julio.
        </p>
      </div>

      <div className="mt-8">
        <label
          htmlFor="cycle"
          className="text-sm font-medium text-slate-700"
        >
          Ciclo escolar
        </label>
        <input
          id="cycle"
          value={cycle}
          onChange={(event) => setCycle(event.target.value)}
          placeholder="2026-2027"
          className="ml-0 mt-2 block rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 sm:w-48"
        />
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {(["primaria", "secundaria", "bachillerato"] as const).map(
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
            Al guardar se recalcularán las deudas de los alumnos de este nivel.
          </p>
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
            value={monthlyCost}
            onChange={(event) => setMonthlyCost(event.target.value)}
            className={fieldClass}
          />
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
            disabled={isSaving}
            className="rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? "Guardando y recalculando..." : "Guardar costos"}
          </button>
        </div>
      </form>
    </section>
  );
}
