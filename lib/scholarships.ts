import type { AlcanceBeca } from "@/types/database";

export type AppliedScholarship = {
  porcentaje_aplicado: number;
  alcance_aplicado: AlcanceBeca;
  becas: { nombre: string };
};

export function scholarshipAppliesTo(
  scholarship: AppliedScholarship | null,
  concept: "inscripcion" | "mensualidad",
) {
  return Boolean(
    scholarship &&
      (scholarship.alcance_aplicado === "ambas" ||
        scholarship.alcance_aplicado === concept),
  );
}

export function getDiscountedCost(
  baseCost: number,
  scholarship: AppliedScholarship | null,
  concept: "inscripcion" | "mensualidad",
) {
  if (!scholarshipAppliesTo(scholarship, concept)) return baseCost;
  return (
    Math.round(
      baseCost * (1 - Number(scholarship!.porcentaje_aplicado) / 100) * 100,
    ) / 100
  );
}

export function getScholarshipScopeLabel(scope: AlcanceBeca) {
  if (scope === "ambas") return "Inscripción y mensualidades";
  return scope === "inscripcion" ? "Inscripción" : "Mensualidades";
}

