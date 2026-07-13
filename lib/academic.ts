import type { Alumno, MesPago } from "@/types/database";

export const ACADEMIC_MONTHS: Array<{
  value: MesPago;
  label: string;
  yearOffset: 0 | 1;
}> = [
  { value: "agosto", label: "Agosto", yearOffset: 0 },
  { value: "septiembre", label: "Septiembre", yearOffset: 0 },
  { value: "octubre", label: "Octubre", yearOffset: 0 },
  { value: "noviembre", label: "Noviembre", yearOffset: 0 },
  { value: "diciembre", label: "Diciembre", yearOffset: 0 },
  { value: "enero", label: "Enero", yearOffset: 1 },
  { value: "febrero", label: "Febrero", yearOffset: 1 },
  { value: "marzo", label: "Marzo", yearOffset: 1 },
  { value: "abril", label: "Abril", yearOffset: 1 },
  { value: "mayo", label: "Mayo", yearOffset: 1 },
  { value: "junio", label: "Junio", yearOffset: 1 },
  { value: "julio", label: "Julio", yearOffset: 1 },
];

export function getCurrentAcademicCycle(date = new Date()) {
  const year = date.getFullYear();
  const startYear = date.getMonth() >= 7 ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
}

export function getCycleStartYear(cycle: string) {
  return Number(cycle.split("-")[0]);
}

export function getAcademicMonthYear(month: MesPago, cycle: string) {
  const configuration = ACADEMIC_MONTHS.find(
    (item) => item.value === month,
  );
  return getCycleStartYear(cycle) + (configuration?.yearOffset ?? 0);
}

export function getFullStudentName(
  student: Pick<
    Alumno,
    "nombre" | "apellido_paterno" | "apellido_materno"
  >,
) {
  return [
    student.nombre,
    student.apellido_paterno,
    student.apellido_materno,
  ]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
}
