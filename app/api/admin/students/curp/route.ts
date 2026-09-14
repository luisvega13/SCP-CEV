import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { isValidCurp, normalizeCurp } from "@/lib/curp";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import type { Database } from "@/types/database";

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
  const studentId = typeof payload.studentId === "string" ? payload.studentId : "";
  const curp = normalizeCurp(typeof payload.curp === "string" ? payload.curp : "");
  const password = typeof payload.password === "string" ? payload.password : "";

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(studentId)) {
    return errorResponse("El identificador del alumno no es válido.", 400);
  }
  if (!isValidCurp(curp)) {
    return errorResponse("La CURP no es válida. Revisa los 18 caracteres y el dígito verificador.", 400);
  }
  if (!password) {
    return errorResponse("Ingresa tu contraseña para confirmar el cambio de CURP.", 400);
  }

  const supabase = await getSupabaseServerClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData.user;
  if (userError || !user) {
    return errorResponse("La sesión expiró. Inicia sesión nuevamente.", 401);
  }
  if (user.app_metadata.role !== "admin") {
    return errorResponse("No tienes permiso para modificar la CURP.", 403);
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

  const { data, error } = await supabase.rpc("actualizar_curp_alumno", {
    p_alumno_id: studentId,
    p_curp: curp,
  });
  if (error) return errorResponse(error.message, 400);

  return NextResponse.json(
    { student: data },
    { headers: { "Cache-Control": "no-store" } },
  );
}
