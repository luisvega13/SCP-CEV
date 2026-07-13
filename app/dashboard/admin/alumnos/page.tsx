"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import type { Alumno } from "@/types/database";

const statusStyles: Record<Alumno["estado"], string> = {
  activo: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  baja: "bg-red-50 text-red-700 ring-red-600/20",
};

export default function StudentsPage() {
  const [students, setStudents] = useState<Alumno[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadStudents() {
      try {
        const supabase = getSupabaseBrowserClient();
        const { data, error: queryError } = await supabase
          .from("alumnos")
          .select("*")
          .order("nombre");

        if (queryError) throw queryError;
        if (isMounted) setStudents(data);
      } catch (caughtError) {
        if (isMounted) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "No fue posible cargar los alumnos.",
          );
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    void loadStudents();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <section>
      <div className="mb-6">
        <p className="text-sm font-medium text-sky-600">Administración</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-950">Alumnos</h1>
        <p className="mt-2 text-sm text-slate-500">
          Consulta los alumnos registrados y su estado actual.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                {["Nombre", "Nivel", "Grado", "Grupo", "Estado"].map((heading) => (
                  <th
                    key={heading}
                    scope="col"
                    className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-600"
                  >
                    {heading}
                  </th>
                ))}
                <th
                  scope="col"
                  className="px-6 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-600"
                >
                  Acciones
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 bg-white">
              {isLoading && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-sm text-slate-500">
                    Cargando alumnos...
                  </td>
                </tr>
              )}

              {!isLoading && error && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-sm text-red-600">
                    {error}
                  </td>
                </tr>
              )}

              {!isLoading && !error && students.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-sm text-slate-500">
                    No hay alumnos registrados.
                  </td>
                </tr>
              )}

              {!isLoading &&
                !error &&
                students.map((student) => (
                  <tr key={student.id} className="transition-colors hover:bg-slate-50">
                    <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-slate-900">
                      {student.nombre}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm capitalize text-slate-600">
                      {student.nivel}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600">
                      {student.grado}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm font-medium uppercase text-slate-600">
                      {student.grupo}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium capitalize ring-1 ring-inset ${statusStyles[student.estado]}`}
                      >
                        {student.estado}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right text-sm">
                      <Link
                        href={`/dashboard/admin/alumnos/${student.id}`}
                        className="font-medium text-sky-600 transition hover:text-sky-800 focus:outline-none focus:underline"
                        aria-label={`Ver detalles de ${student.nombre}`}
                      >
                        Ver detalles
                      </Link>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
