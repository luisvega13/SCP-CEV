import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export function getSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey =
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !secretKey) {
    throw new Error(
      "Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY en el servidor.",
    );
  }

  return createClient<Database>(url, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

