"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import Link from "next/link";
import { invalidateAdminData } from "@/lib/admin-data";
import {
  ACADEMIC_LEVEL_LABELS,
  ACADEMIC_LEVELS,
  getAcademicGradeLabel,
  getMaximumGrade,
} from "@/lib/academic";
import { CURP_HELP_TEXT, isValidCurp, normalizeCurp } from "@/lib/curp";
import type {
  NivelEscolar,
  SexoAlumno,
} from "@/types/database";

type CreatedCredentials = {
  nombre: string;
  username: string;
  password: string;
};

const fieldClass =
  "mt-2 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100";

export default function NewStudentPage() {
  const [nombre, setNombre] = useState("");
  const [apellidoPaterno, setApellidoPaterno] = useState("");
  const [apellidoMaterno, setApellidoMaterno] = useState("");
  const [matricula, setMatricula] = useState("");
  const [nivel, setNivel] = useState<NivelEscolar>("primaria");
  const [grado, setGrado] = useState("1");
  const [grupo, setGrupo] = useState("");
  const [sexo, setSexo] = useState<SexoAlumno>("mujer");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [createdCredentials, setCreatedCredentials] =
    useState<CreatedCredentials | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setCreatedCredentials(null);

    const normalizedName = nombre.trim().replace(/\s+/g, " ");
    const normalizedPaternalSurname = apellidoPaterno
      .trim()
      .replace(/\s+/g, " ");
    const normalizedMaternalSurname = apellidoMaterno
      .trim()
      .replace(/\s+/g, " ");
    const normalizedEnrollment = normalizeCurp(matricula);
    const normalizedGroup = grupo.trim().toUpperCase();
    const firstName = normalizedName.split(" ")[0] ?? "";

    if (firstName.length < 2 || !normalizedPaternalSurname) {
      setError(
        "El nombre y el apellido paterno son obligatorios; el primer nombre debe tener al menos dos letras.",
      );
      return;
    }

    if (!isValidCurp(normalizedEnrollment)) {
      setError("La CURP no es válida. Revisa los 18 caracteres y el dígito verificador.");
      return;
    }

    if (!normalizedGroup) {
      setError("El grupo es obligatorio.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/admin/students/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: normalizedName,
          apellidoPaterno: normalizedPaternalSurname,
          apellidoMaterno: normalizedMaternalSurname,
          curp: normalizedEnrollment,
          nivel,
          grado: Number(grado),
          grupo: normalizedGroup,
          sexo,
          estado: "activo",
        }),
      });
      const responseText = await response.text();
      let result: {
        error?: string;
        credentials?: { email: string; username: string; password: string };
      };
      try {
        result = responseText ? JSON.parse(responseText) : {};
      } catch {
        result = {};
      }
      if (!response.ok || !result.credentials) {
        throw new Error(
          result.error ||
            `No fue posible registrar al alumno (error ${response.status}). Revisa la terminal del servidor.`,
        );
      }

      invalidateAdminData("students:");
      invalidateAdminData("dashboard:");
      invalidateAdminData("reports:");
      setCreatedCredentials({
        nombre: [
          normalizedName,
          normalizedPaternalSurname,
          normalizedMaternalSurname,
        ]
          .filter(Boolean)
          .join(" "),
        username: result.credentials.username,
        password: result.credentials.password,
      });
      setNombre("");
      setApellidoPaterno("");
      setApellidoMaterno("");
      setMatricula("");
      setNivel("primaria");
      setGrado("1");
      setGrupo("");
      setSexo("mujer");
    } catch (caughtError) {
      console.error("Error al registrar alumno:", caughtError);
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "No fue posible registrar al alumno.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="mx-auto max-w-3xl">
      <Link
        href="/dashboard/admin/alumnos"
        className="text-sm font-medium text-sky-600 hover:text-sky-800"
      >
        ← Volver a alumnos
      </Link>

      <div className="mt-5">
        <p className="text-sm font-medium text-sky-600">Administración</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-950">
          Registrar alumno
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          La CURP será el identificador institucional y el sistema generará una clave de acceso corta.
        </p>
      </div>

      {createdCredentials && (
        <div
          role="status"
          className="mt-8 rounded-xl border border-emerald-200 bg-emerald-50 p-6"
        >
          <h2 className="font-semibold text-emerald-900">
            Alumno registrado correctamente
          </h2>
          <p className="mt-1 text-sm text-emerald-800">
            Entrega estas credenciales temporales a {createdCredentials.nombre}.
          </p>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-emerald-700">Clave de acceso</dt>
              <dd className="mt-1 font-mono font-semibold text-emerald-950">
                {createdCredentials.username}
              </dd>
            </div>
            <div>
              <dt className="text-emerald-700">Contraseña temporal</dt>
              <dd className="mt-1 font-mono text-lg font-bold tracking-wider text-emerald-950">
                {createdCredentials.password}
              </dd>
            </div>
          </dl>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="mt-8 grid gap-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:grid-cols-2 sm:p-8"
      >
        <div className="sm:col-span-2">
          <label htmlFor="nombre" className="text-sm font-medium text-slate-700">
            Nombre(s)
          </label>
          <input
            id="nombre"
            name="nombre"
            type="text"
            required
            value={nombre}
            onChange={(event) => setNombre(event.target.value)}
            placeholder="Luis Antonio"
            className={fieldClass}
          />
        </div>

        <div>
          <label
            htmlFor="apellidoPaterno"
            className="text-sm font-medium text-slate-700"
          >
            Apellido paterno
          </label>
          <input
            id="apellidoPaterno"
            type="text"
            required
            value={apellidoPaterno}
            onChange={(event) => setApellidoPaterno(event.target.value)}
            placeholder="García"
            className={fieldClass}
          />
        </div>

        <div>
          <label
            htmlFor="apellidoMaterno"
            className="text-sm font-medium text-slate-700"
          >
            Apellido materno
          </label>
          <input
            id="apellidoMaterno"
            type="text"
            value={apellidoMaterno}
            onChange={(event) => setApellidoMaterno(event.target.value)}
            placeholder="López"
            className={fieldClass}
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="matricula" className="text-sm font-medium text-slate-700">
            CURP
          </label>
          <input
            id="matricula"
            name="matricula"
            type="text"
            required
            maxLength={18}
            autoCapitalize="characters"
            autoComplete="off"
            value={matricula}
            onChange={(event) => setMatricula(normalizeCurp(event.target.value))}
            placeholder="Ingresa la CURP del alumno"
            className={fieldClass}
          />
          <p className="mt-1 text-xs text-slate-500">{CURP_HELP_TEXT}</p>
        </div>

        <div>
          <label htmlFor="nivel" className="text-sm font-medium text-slate-700">
            Nivel
          </label>
          <select
            id="nivel"
            name="nivel"
            value={nivel}
            onChange={(event) => {
              setNivel(event.target.value as NivelEscolar);
              setGrado("1");
            }}
            className={fieldClass}
          >
            {ACADEMIC_LEVELS.map((value) => (
              <option key={value} value={value}>{ACADEMIC_LEVEL_LABELS[value]}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="grado" className="text-sm font-medium text-slate-700">
            {nivel === "bachillerato" ? "Semestre" : "Grado"}
          </label>
          <select
            id="grado"
            name="grado"
            value={grado}
            onChange={(event) => setGrado(event.target.value)}
            className={fieldClass}
          >
            {Array.from(
              { length: getMaximumGrade(nivel) },
              (_, index) => index + 1,
            ).map((grade) => (
              <option key={grade} value={grade}>
                {getAcademicGradeLabel(nivel, grade)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="grupo" className="text-sm font-medium text-slate-700">
            Grupo
          </label>
          <input
            id="grupo"
            name="grupo"
            type="text"
            required
            maxLength={10}
            value={grupo}
            onChange={(event) => setGrupo(event.target.value)}
            placeholder="A"
            className={fieldClass}
          />
        </div>

        <div>
          <label htmlFor="sexo" className="text-sm font-medium text-slate-700">
            Sexo
          </label>
          <select
            id="sexo"
            name="sexo"
            value={sexo}
            onChange={(event) => setSexo(event.target.value as SexoAlumno)}
            className={fieldClass}
          >
            <option value="mujer">Mujer</option>
            <option value="hombre">Hombre</option>
          </select>
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 sm:col-span-2"
          >
            {error}
          </p>
        )}

        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Registrando..." : "Registrar alumno"}
          </button>
        </div>
      </form>
    </section>
  );
}
