export async function downloadPaymentReceipt(paymentId: string, folio?: string) {
  const response = await fetch(`/api/payment-receipts/${encodeURIComponent(paymentId)}`, {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) {
    const result = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(result?.error || "No fue posible generar el comprobante de pago.");
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `comprobante-${folio || paymentId}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
