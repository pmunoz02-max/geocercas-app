// src/lib/ensureUserContext.ts
import type { SupabaseClient } from "@supabase/supabase-js";

export type UserContext = {
  user_id: string;
  email: string | null;
  display_name: string | null;
  default_org: string;
};

export async function ensureUserContext(
  supabase: SupabaseClient
): Promise<UserContext> {
  const {
    data: { user },
    error: sErr,
  } = await supabase.auth.getUser();

  if (sErr) throw sErr;
  if (!user) throw new Error("No hay sesión");

  const { data, error } = await supabase.rpc("ensure_user_context");
  if (error) throw error;

  if (!data?.default_org) {
    throw new Error("No se pudo asignar default_org (RPC no devolvió valor).");
  }

  return data as UserContext;
}
