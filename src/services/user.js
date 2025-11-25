// /src/services/user.js
import { supabase } from "@/lib/supabaseClient";

/** Devuelve el usuario autenticado (auth.users) */
export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user ?? null;
}

/** Devuelve tu perfil normalizado con roleSlug/roleName */
export async function getMyProfile() {
  const user = await getCurrentUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, role_id, role, roles:role_id(slug, name)")
    .eq("id", user.id)
    .single();

  if (error) throw error;

  const roleSlug = data?.roles?.slug || data?.role || null; // 'admin' | 'owner' | 'tracker'
  const roleName = data?.roles?.name || data?.role || null;

  return data ? { ...data, roleSlug, roleName } : null;
}
