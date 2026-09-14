import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import {
  getDefaultStudentPassword,
  getStudentPasswordInitials,
  SHORT_STUDENT_EMAIL_PATTERN,
} from "@/lib/student-access";
import type { Database } from "@/types/database";

export const dynamic = "force-dynamic";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function errorResponse(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return errorResponse("Solicitud no permitida.", 403);

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const studentId = typeof body?.studentId === "string" ? body.studentId : "";
  const adminPassword = typeof body?.password === "string" ? body.password : "";
  if (!UUID_PATTERN.test(studentId)) return errorResponse("El alumno no es válido.", 400);
  if (!adminPassword) return errorResponse("Ingresa tu contraseña para continuar.", 400);

  const sessionClient = await getSupabaseServerClient();
  const { data: userData, error: userError } = await sessionClient.auth.getUser();
  const admin = userData.user;
  if (userError || !admin) return errorResponse("La sesión expiró.", 401);
  if (admin.app_metadata.role !== "admin") return errorResponse("No tienes permiso para restablecer accesos.", 403);
  if (!admin.email) return errorResponse("Tu cuenta no tiene un correo válido.", 400);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return errorResponse("Falta la configuración de Supabase.", 500);
  const verifier = createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: verification, error: verificationError } = await verifier.auth.signInWithPassword({
    email: admin.email,
    password: adminPassword,
  });
  if (verificationError || verification.user?.id !== admin.id) {
    return errorResponse("La contraseña del administrador es incorrecta.", 401);
  }

  const { data: student, error: studentError } = await sessionClient
    .from("alumnos")
    .select("usuario_id, correo_acceso, nombre")
    .eq("id", studentId)
    .single();
  if (studentError) return errorResponse("No se encontró el alumno.", 404);
  if (!student.usuario_id) {
    return errorResponse("El alumno no tiene una cuenta de acceso vinculada.", 409);
  }

  let adminClient: ReturnType<typeof getSupabaseAdminClient>;
  try {
    adminClient = getSupabaseAdminClient();
  } catch (caughtError) {
    console.error("Configuración administrativa de Supabase incompleta:", caughtError);
    return errorResponse(
      "Falta configurar SUPABASE_SECRET_KEY en el servidor.",
      500,
    );
  }
  let accessEmail = student.correo_acceso ?? "";

  if (!SHORT_STUDENT_EMAIL_PATTERN.test(accessEmail)) {
    let emailWasUpdated = false;
    for (let attempt = 0; attempt < 5 && !emailWasUpdated; attempt += 1) {
      const { data: generatedEmail, error: emailError } = await adminClient.rpc(
        "generar_correo_acceso_alumno",
        {},
      );
      if (emailError) return errorResponse(emailError.message, 500);

      const { error: authEmailError } = await adminClient.auth.admin.updateUserById(
        student.usuario_id,
        { email: generatedEmail },
      );
      if (!authEmailError) {
        accessEmail = generatedEmail;
        emailWasUpdated = true;
      } else if (!/already|registered|exists/i.test(authEmailError.message)) {
        return errorResponse(authEmailError.message, 400);
      }
    }
    if (!emailWasUpdated) {
      return errorResponse("No fue posible reservar un correo corto único.", 500);
    }

    const { error: accessEmailError } = await adminClient
      .from("alumnos")
      .update({ correo_acceso: accessEmail })
      .eq("id", studentId);
    if (accessEmailError) return errorResponse(accessEmailError.message, 400);
  }

  const temporaryPassword = getDefaultStudentPassword(student.nombre, accessEmail);
  const passwordInitials = getStudentPasswordInitials(student.nombre);

  const { error: updateError } = await adminClient.auth.admin.updateUserById(
    student.usuario_id,
    { password: temporaryPassword },
  );
  if (updateError) return errorResponse(updateError.message, 400);

  const { error: stateError } = await adminClient
    .from("alumnos")
    .update({
      iniciales_clave_temporal: passwordInitials,
      contrasena_temporal_activa: true,
      contrasena_actualizada_at: new Date().toISOString(),
    })
    .eq("id", studentId);
  if (stateError) return errorResponse(stateError.message, 400);

  return NextResponse.json(
    { email: accessEmail, temporaryPassword, passwordInitials },
    { headers: { "Cache-Control": "no-store" } },
  );
}
