import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import type { Database, MetodoPago } from "@/types/database";

export const dynamic = "force-dynamic";

function errorResponse(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: NextRequest) {
  const requestOrigin = request.headers.get("origin");
  if (requestOrigin && requestOrigin !== request.nextUrl.origin) {
    return errorResponse("Solicitud no permitida.", 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("La solicitud no contiene datos válidos.", 400);
  }

  if (!body || typeof body !== "object") {
    return errorResponse("La solicitud no contiene datos válidos.", 400);
  }

  const payload = body as Record<string, unknown>;
  const paymentId = typeof payload.paymentId === "string" ? payload.paymentId : "";
  const reason = typeof payload.reason === "string" ? payload.reason.trim() : "";
  const password = typeof payload.password === "string" ? payload.password : "";
  const paymentMethod =
    typeof payload.paymentMethod === "string" ? payload.paymentMethod : "";
  const amount = Number(payload.amount);

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(paymentId)) {
    return errorResponse("El identificador del pago no es válido.", 400);
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return errorResponse("El monto debe ser mayor a cero.", 400);
  }
  const validPaymentMethods: MetodoPago[] = [
    "efectivo",
    "tarjeta",
    "transferencia",
    "deposito",
  ];
  if (!validPaymentMethods.includes(paymentMethod as MetodoPago)) {
    return errorResponse("Selecciona un método de pago válido.", 400);
  }
  if (reason.length < 5 || reason.length > 500) {
    return errorResponse("El motivo debe contener entre 5 y 500 caracteres.", 400);
  }
  if (!password) {
    return errorResponse("Ingresa tu contraseña para confirmar.", 400);
  }

  const supabase = await getSupabaseServerClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData.user;

  if (userError || !user) {
    return errorResponse("La sesión expiró. Inicia sesión nuevamente.", 401);
  }
  if (user.app_metadata.role !== "admin") {
    return errorResponse("No tienes permiso para modificar pagos.", 403);
  }
  if (!user.email) {
    return errorResponse("La cuenta administradora no tiene un correo válido.", 400);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return errorResponse("Falta la configuración de Supabase.", 500);
  }

  // Cliente aislado: valida la contraseña sin reemplazar ni persistir la sesión actual.
  const verificationClient = createClient<Database>(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const { data: verification, error: passwordError } =
    await verificationClient.auth.signInWithPassword({
      email: user.email,
      password,
    });

  if (passwordError || verification.user?.id !== user.id) {
    return errorResponse("La contraseña es incorrecta.", 401);
  }

  const { data, error: updateError } = await supabase.rpc(
    "modificar_pago_auditado",
    {
      p_pago_id: paymentId,
      p_nuevo_monto: Math.round(amount * 100) / 100,
      p_metodo_pago: paymentMethod as MetodoPago,
      p_motivo: reason,
    },
  );

  if (updateError) {
    return errorResponse(updateError.message, 400);
  }

  return NextResponse.json(
    { payment: data },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function DELETE(request: NextRequest) {
  const requestOrigin = request.headers.get("origin");
  if (requestOrigin && requestOrigin !== request.nextUrl.origin) {
    return errorResponse("Solicitud no permitida.", 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("La solicitud no contiene datos válidos.", 400);
  }

  if (!body || typeof body !== "object") {
    return errorResponse("La solicitud no contiene datos válidos.", 400);
  }

  const payload = body as Record<string, unknown>;
  const paymentId = typeof payload.paymentId === "string" ? payload.paymentId : "";
  const reason = typeof payload.reason === "string" ? payload.reason.trim() : "";
  const password = typeof payload.password === "string" ? payload.password : "";

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(paymentId)) {
    return errorResponse("El identificador del pago no es válido.", 400);
  }
  if (reason.length < 5 || reason.length > 500) {
    return errorResponse("El motivo debe contener entre 5 y 500 caracteres.", 400);
  }
  if (!password) {
    return errorResponse("Ingresa tu contraseña para confirmar.", 400);
  }

  const supabase = await getSupabaseServerClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData.user;

  if (userError || !user) {
    return errorResponse("La sesión expiró. Inicia sesión nuevamente.", 401);
  }
  if (user.app_metadata.role !== "admin") {
    return errorResponse("No tienes permiso para eliminar pagos.", 403);
  }
  if (!user.email) {
    return errorResponse("La cuenta administradora no tiene un correo válido.", 400);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return errorResponse("Falta la configuración de Supabase.", 500);
  }

  const verificationClient = createClient<Database>(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const { data: verification, error: passwordError } =
    await verificationClient.auth.signInWithPassword({
      email: user.email,
      password,
    });

  if (passwordError || verification.user?.id !== user.id) {
    return errorResponse("La contraseña es incorrecta.", 401);
  }

  const { error: deleteError } = await supabase.rpc("eliminar_pago_auditado", {
    p_pago_id: paymentId,
    p_motivo: reason,
  });

  if (deleteError) {
    return errorResponse(deleteError.message, 400);
  }

  return NextResponse.json(
    { success: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
