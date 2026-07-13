"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getFullStudentName } from "@/lib/academic";
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
  const [levelFilter, setLevelFilter] = useState("todos");
  const [gradeFilter, setGradeFilter] = useState("todos");
  const [groupFilter, setGroupFilter] = useState("todos");

  useEffect(() => {
    let isMounted = true;

    async function loadStudents() {
      try {
        const supabase = getSupabaseBrowserClient();
        const { data, error: queryError } = await supabase
          .from("alumnos")
          .select("*")
          .order("apellido_paterno")
          .order("apellido_materno")
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

  const availableGrades = useMemo(
    () =>
      Array.from(
        new Set(
          students
            .filter(
              (student) =>
                levelFilter === "todos" || student.nivel === levelFilter,
            )
            .map((student) => student.grado),
        ),
      ).sort((first, second) => first - second),
    [levelFilter, students],
  );

  const availableGroups = useMemo(
    () =>
      Array.from(
        new Set(
          students
            .filter(
              (student) =>
                (levelFilter === "todos" || student.nivel === levelFilter) &&
                (gradeFilter === "todos" ||
                  student.grado === Number(gradeFilter)),
            )
            .map((student) => student.grupo),
        ),
      ).sort((first, second) => first.localeCompare(second, "es")),
    [gradeFilter, levelFilter, students],
  );

  const filteredStudents = useMemo(
    () =>
      students.filter(
        (student) =>
          (levelFilter === "todos" || student.nivel === levelFilter) &&
          (gradeFilter === "todos" ||
            student.grado === Number(gradeFilter)) &&
          (groupFilter === "todos" || student.grupo === groupFilter),
      ),
    [gradeFilter, groupFilter, levelFilter, students],
  );

  return (
    <section>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-sky-600">Administración</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-950">Alumnos</h1>
          <p className="mt-2 text-sm text-slate-500">
            Consulta los alumnos registrados y su estado actual.
          </p>
        </div>
        <Link
          href="/dashboard/admin/alumnos/nuevo"
          className="inline-flex items-center justify-center rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
        >
          Nuevo alumno
        </Link>
      </div>

      <div className="mb-6 grid gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-3">
        <div>
          <label
            htmlFor="levelFilter"
            className="text-xs font-semibold uppercase tracking-wider text-slate-500"
          >
            Nivel
          </label>
          <select
            id="levelFilter"
            value={levelFilter}
            onChange={(event) => {
              setLevelFilter(event.target.value);
              setGradeFilter("todos");
              setGroupFilter("todos");
            }}
            className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
          >
            <option value="todos">Todos los niveles</option>
            <option value="primaria">Primaria</option>
            <option value="secundaria">Secundaria</option>
            <option value="bachillerato">Bachillerato</option>
          </select>
        </div>
        <div>
          <label
            htmlFor="gradeFilter"
            className="text-xs font-semibold uppercase tracking-wider text-slate-500"
          >
            Grado
          </label>
          <select
            id="gradeFilter"
            value={gradeFilter}
            onChange={(event) => {
              setGradeFilter(event.target.value);
              setGroupFilter("todos");
            }}
            className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
          >
            <option value="todos">Todos los grados</option>
            {availableGrades.map((grade) => (
              <option key={grade} value={grade}>
                {grade}°
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="groupFilter"
            className="text-xs font-semibold uppercase tracking-wider text-slate-500"
          >
            Grupo
          </label>
          <select
            id="groupFilter"
            value={groupFilter}
            onChange={(event) => setGroupFilter(event.target.value)}
            className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
          >
            <option value="todos">Todos los grupos</option>
            {availableGroups.map((group) => (
              <option key={group} value={group}>
                {group}
              </option>
            ))}
          </select>
        </div>
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

              {!isLoading && !error && filteredStudents.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-sm text-slate-500">
                    No hay alumnos que coincidan con los filtros seleccionados.
                  </td>
                </tr>
              )}

              {!isLoading &&
                !error &&
                filteredStudents.map((student) => (
                  <tr key={student.id} className="transition-colors hover:bg-slate-50">
                    <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-slate-900">
                      {getFullStudentName(student)}
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
                        aria-label={`Ver detalles de ${getFullStudentName(student)}`}
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
