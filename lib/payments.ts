import type { MetodoPago } from "@/types/database";

export const PAYMENT_METHOD_OPTIONS: Array<{
  value: MetodoPago;
  label: string;
}> = [
  { value: "efectivo", label: "Efectivo" },
  { value: "tarjeta", label: "Tarjeta" },
  { value: "transferencia", label: "Transferencia" },
  { value: "deposito", label: "Depósito" },
];

export function getPaymentMethodLabel(method: MetodoPago) {
  return (
    PAYMENT_METHOD_OPTIONS.find((option) => option.value === method)?.label ??
    method
  );
}
