import type { AlcanceBeca, TipoDescuentoBeca } from "@/types/database";

export type AppliedScholarship = {
  porcentaje_aplicado: number;
  tipo_descuento_aplicado: TipoDescuentoBeca;
  monto_fijo_aplicado: number;
  alcance_aplicado: AlcanceBeca;
  vigencia_desde: string;
  becas: { nombre: string };
};

type ScholarshipPeriod = {
  month:
    | "enero"
    | "febrero"
    | "marzo"
    | "abril"
    | "mayo"
    | "junio"
    | "julio"
    | "agosto"
    | "septiembre"
    | "octubre"
    | "noviembre"
    | "diciembre";
  year: number;
};

const MONTH_NUMBERS: Record<ScholarshipPeriod["month"], number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

export function scholarshipAppliesTo(
  scholarship: AppliedScholarship | null,
  concept: "inscripcion" | "mensualidad",
  period?: ScholarshipPeriod,
) {
  if (
    !scholarship ||
    (scholarship.alcance_aplicado !== "ambas" &&
      scholarship.alcance_aplicado !== concept)
  ) {
    return false;
  }
  if (!period || !scholarship.vigencia_desde) return true;

  const effectiveMonth = scholarship.vigencia_desde.slice(0, 7);
  const periodMonth = `${period.year}-${String(MONTH_NUMBERS[period.month]).padStart(2, "0")}`;
  return periodMonth >= effectiveMonth;
}

export function getDiscountedCost(
  baseCost: number,
  scholarship: AppliedScholarship | null,
  concept: "inscripcion" | "mensualidad",
  period?: ScholarshipPeriod,
) {
  if (!scholarshipAppliesTo(scholarship, concept, period)) return baseCost;
  const discountedCost = scholarship!.tipo_descuento_aplicado === "monto_fijo"
    ? baseCost - Number(scholarship!.monto_fijo_aplicado)
    : baseCost * (1 - Number(scholarship!.porcentaje_aplicado) / 100);
  return Math.max(0, Math.round(discountedCost * 100) / 100);
}

const currencyFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

export function getScholarshipDiscountLabel(discount: {
  tipo_descuento?: TipoDescuentoBeca;
  porcentaje?: number;
  monto_fijo?: number;
  tipo_descuento_aplicado?: TipoDescuentoBeca;
  porcentaje_aplicado?: number;
  monto_fijo_aplicado?: number;
}) {
  const type = discount.tipo_descuento ?? discount.tipo_descuento_aplicado ?? "porcentaje";
  if (type === "monto_fijo") {
    return currencyFormatter.format(Number(discount.monto_fijo ?? discount.monto_fijo_aplicado ?? 0));
  }
  return `${Number(discount.porcentaje ?? discount.porcentaje_aplicado ?? 0).toFixed(2)}%`;
}

export function getScholarshipScopeLabel(scope: AlcanceBeca) {
  if (scope === "ambas") return "Inscripción y mensualidades";
  return scope === "inscripcion" ? "Inscripción" : "Mensualidades";
}
