import { NextResponse, type NextRequest } from "next/server";
import { getMaximumGrade } from "@/lib/academic";
import { isValidCurp, normalizeCurp } from "@/lib/curp";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import {
  getDefaultStudentPassword,
  getStudentAccessKey,
  getStudentPasswordInitials,
} from "@/lib/student-access";
import type { EstadoAlumno, NivelEscolar, SexoAlumno } from "@/types/database";

export const dynamic = "force-dynamic";

const LEVELS = new Set(["preescolar", "primaria", "secundaria", "bachillerato"]);
const STATUSES = new Set(["activo", "pausa", "baja"]);
const SEXES = new Set(["hombre", "mujer"]);

function errorResponse(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
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

  const input = body as Record<string, unknown>;
  const nombre = typeof input.nombre === "string" ? input.nombre.trim().replace(/\s+/g, " ") : "";
  const apellidoPaterno = typeof input.apellidoPaterno === "string" ? input.apellidoPaterno.trim().replace(/\s+/g, " ") : "";
  const apellidoMaterno = typeof input.apellidoMaterno === "string" ? input.apellidoMaterno.trim().replace(/\s+/g, " ") : "";
  const curp = normalizeCurp(typeof input.curp === "string" ? input.curp : "");
  const nivel = typeof input.nivel === "string" ? input.nivel : "";
  const grado = Number(input.grado);
  const grupo = typeof input.grupo === "string" ? input.grupo.trim().toUpperCase() : "";
  const sexo = typeof input.sexo === "string" ? input.sexo : "";
  const estado = typeof input.estado === "string" ? input.estado : "activo";

  if (nombre.length < 2 || !apellidoPaterno || !grupo) {
    return errorResponse("Nombre, apellido paterno y grupo son obligatorios.", 400);
  }
  if (!isValidCurp(curp)) {
    return errorResponse("La CURP no es válida.", 400);
  }
  if (!LEVELS.has(nivel)) return errorResponse("El nivel no es válido.", 400);
  if (!Number.isInteger(grado) || grado < 1 || grado > getMaximumGrade(nivel as NivelEscolar)) {
    return errorResponse("El grado no es válido para el nivel seleccionado.", 400);
  }
  if (!SEXES.has(sexo)) return errorResponse("El sexo no es válido.", 400);
  if (!STATUSES.has(estado)) return errorResponse("El estado académico no es válido.", 400);

  const sessionClient = await getSupabaseServerClient();
  const { data: userData, error: userError } = await sessionClient.auth.getUser();
  if (userError || !userData.user) return errorResponse("La sesión expiró.", 401);
  if (userData.user.app_metadata.role !== "admin") {
    return errorResponse("No tienes permiso para registrar alumnos.", 403);
  }

  const { data: existingStudent, error: lookupError } = await sessionClient
    .from("alumnos")
    .select("id")
    .eq("matricula", curp)
    .maybeSingle();
  if (lookupError) return errorResponse(lookupError.message, 400);
  if (existingStudent) return errorResponse("Ya existe un alumno con esa CURP.", 409);

  let adminClient: ReturnType<typeof getSupabaseAdminClient>;
  try {
    adminClient = getSupabaseAdminClient();
  } catch (caughtError) {
    console.error("Configuración administrativa de Supabase incompleta:", caughtError);
    return errorResponse(
      "Falta configurar SUPABASE_SECRET_KEY en el servidor. Agrégala a .env.local y reinicia Next.js.",
      500,
    );
  }
  let password = "";
  let authUserId = "";
  let email = "";

  for (let attempt = 0; attempt < 5 && !authUserId; attempt += 1) {
    const { data: generatedEmail, error: emailError } = await adminClient.rpc(
      "generar_correo_acceso_alumno",
      {},
    );
    if (emailError) return errorResponse(emailError.message, 500);
    email = generatedEmail;
    password = getDefaultStudentPassword(nombre, email);

    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { role: "student" },
      user_metadata: {
        nombre,
        apellido_paterno: apellidoPaterno,
        apellido_materno: apellidoMaterno,
        matricula: curp,
      },
    });
    if (!authError && authData.user) authUserId = authData.user.id;
    else if (!authError || !/already|registered|exists/i.test(authError.message)) {
      return errorResponse(authError?.message ?? "No fue posible crear el acceso.", 400);
    }
  }

  if (!authUserId) return errorResponse("No fue posible reservar un correo único.", 500);

  const { data: student, error: insertError } = await adminClient
    .from("alumnos")
    .insert({
      nombre,
      apellido_paterno: apellidoPaterno,
      apellido_materno: apellidoMaterno,
      matricula: curp,
      correo_acceso: email,
      iniciales_clave_temporal: getStudentPasswordInitials(nombre),
      contrasena_temporal_activa: true,
      contrasena_actualizada_at: new Date().toISOString(),
      nivel: nivel as NivelEscolar,
      grado,
      grupo,
      sexo: sexo as SexoAlumno,
      estado: estado as EstadoAlumno,
      usuario_id: authUserId,
    })
    .select("*")
    .single();

  if (insertError) {
    await adminClient.auth.admin.deleteUser(authUserId);
    return errorResponse(insertError.message, 400);
  }

  return NextResponse.json(
    { student, credentials: { email, username: getStudentAccessKey(email), password } },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}
