import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import type { Database } from "@/types/database";

export const dynamic = "force-dynamic";

function errorResponse(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CYCLE_PATTERN = /^(\d{4})-(\d{4})$/;

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
  const studentId = typeof payload.studentId === "string" ? payload.studentId : "";
  const scholarshipId = typeof payload.scholarshipId === "string" ? payload.scholarshipId : "";
  const cycle = typeof payload.cycle === "string" ? payload.cycle : "";
  const observations = typeof payload.observations === "string" ? payload.observations.trim() : "";
  const password = typeof payload.password === "string" ? payload.password : "";
  const cycleMatch = CYCLE_PATTERN.exec(cycle);

  if (!UUID_PATTERN.test(studentId) || !UUID_PATTERN.test(scholarshipId)) {
    return errorResponse("El alumno o la beca seleccionada no es válido.", 400);
  }
  if (!cycleMatch || Number(cycleMatch[2]) !== Number(cycleMatch[1]) + 1) {
    return errorResponse("El ciclo escolar no es válido.", 400);
  }
  if (observations.length > 500) {
    return errorResponse("Las observaciones no pueden exceder 500 caracteres.", 400);
  }
  if (!password) {
    return errorResponse("Ingresa tu contraseña para autorizar la asignación.", 400);
  }

  const supabase = await getSupabaseServerClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData.user;
  if (userError || !user) return errorResponse("La sesión expiró. Inicia sesión nuevamente.", 401);
  if (user.app_metadata.role !== "admin") return errorResponse("No tienes permiso para asignar becas.", 403);
  if (!user.email) return errorResponse("La cuenta administradora no tiene un correo válido.", 400);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return errorResponse("Falta la configuración de Supabase.", 500);

  const verificationClient = createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: verification, error: passwordError } =
    await verificationClient.auth.signInWithPassword({ email: user.email, password });
  if (passwordError || verification.user?.id !== user.id) {
    return errorResponse("La contraseña es incorrecta.", 401);
  }

  const { data, error } = await supabase.rpc("asignar_beca_alumno", {
    p_alumno_id: studentId,
    p_beca_id: scholarshipId,
    p_ciclo_escolar: cycle,
    p_observaciones: observations,
  });
  if (error) return errorResponse(error.message, 400);

  return NextResponse.json(
    { assignment: data },
    { headers: { "Cache-Control": "no-store" } },
  );
}
