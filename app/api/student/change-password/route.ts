import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getDefaultStudentPassword } from "@/lib/student-access";

export const dynamic = "force-dynamic";

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

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";
  if (newPassword.length < 8) {
    return errorResponse("La nueva contraseña debe tener al menos 8 caracteres.", 400);
  }
  if (newPassword.length > 72) {
    return errorResponse("La nueva contraseña es demasiado larga.", 400);
  }

  const sessionClient = await getSupabaseServerClient();
  const { data: userData, error: userError } = await sessionClient.auth.getUser();
  const user = userData.user;
  if (userError || !user) return errorResponse("La sesión expiró.", 401);
  if (user.app_metadata.role !== "student") {
    return errorResponse("Esta acción solo está disponible para alumnos.", 403);
  }

  const { data: student, error: studentError } = await sessionClient
    .from("alumnos")
    .select("id, nombre, correo_acceso")
    .eq("usuario_id", user.id)
    .single();
  if (studentError || !student?.correo_acceso) {
    return errorResponse("No se encontró el acceso asociado al alumno.", 404);
  }

  const defaultPassword = getDefaultStudentPassword(student.nombre, student.correo_acceso);
  if (newPassword === defaultPassword) {
    return errorResponse("Elige una contraseña diferente a la predeterminada.", 400);
  }

  let adminClient: ReturnType<typeof getSupabaseAdminClient>;
  try {
    adminClient = getSupabaseAdminClient();
  } catch (caughtError) {
    console.error("Configuración administrativa de Supabase incompleta:", caughtError);
    return errorResponse("El cambio de contraseña no está configurado en el servidor.", 500);
  }

  const { error: authError } = await adminClient.auth.admin.updateUserById(
    user.id,
    { password: newPassword },
  );
  if (authError) return errorResponse(authError.message, 400);

  const { error: stateError } = await adminClient
    .from("alumnos")
    .update({
      contrasena_temporal_activa: false,
      contrasena_actualizada_at: new Date().toISOString(),
    })
    .eq("id", student.id);
  if (stateError) {
    await adminClient.auth.admin.updateUserById(user.id, {
      password: defaultPassword,
    });
    return errorResponse("No fue posible confirmar el cambio. Inténtalo nuevamente.", 500);
  }

  return NextResponse.json(
    { success: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
