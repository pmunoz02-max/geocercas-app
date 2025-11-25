// src/services/orgs.ts
import { supabase } from "@/lib/supabaseClient";

/** Roles soportados en la BD */
export type Role = "owner" | "admin" | "tracker" | "viewer";

/** Organización (modelo mínimo que devolvemos desde RPC o SELECTs) */
export interface Organization {
  id: string;
  name: string;
  slug: string | null;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

/** Membresía básica (vista my_memberships) */
export interface Membership {
  org_id: string;
  user_id: string;
  role: Role;
  created_at: string;
  org_name?: string;
  slug?: string | null;
}

/** Fila normalizada para Members.jsx */
export interface MemberRow {
  org_id: string;
  user_id: string;
  role: Role;
  created_at: string;
  profiles: {
    full_name: string | null;
    avatar_url: string | null;
  };
}

/* =======================================================================
   RPCs y consultas
   ======================================================================= */

/** Crea una organización y te asigna como OWNER (RPC create_organization) */
export async function createOrganization(name: string, slug?: string | null) {
  const { data, error } = await supabase.rpc("create_organization", {
    p_name: name,
    p_slug: slug ?? null,
  });
  if (error) throw error;
  return data as Organization;
}

/** Lista las organizaciones del usuario actual (vista my_memberships) */
export async function listMyOrganizations() {
  const { data, error } = await supabase
    .from("my_memberships")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as Membership[];
}

/**
 * Lista miembros de una organización usando la VISTA members_with_profiles
 * (evita la necesidad de una FK directa memberships.user_id -> profiles.user_id)
 */
export async function listMembers(orgId: string) {
  const { data, error } = await supabase
    .from("members_with_profiles")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((r: any) => ({
    org_id: r.org_id,
    user_id: r.user_id,
    role: r.role as Role,
    created_at: r.created_at,
    profiles: {
      full_name: r.full_name ?? "(sin nombre)",
      avatar_url: r.avatar_url ?? null,
    },
  })) as MemberRow[];
}

/** Cambia rol (solo owner/admin) – RPC set_member_role */
export async function setMemberRole(orgId: string, userId: string, role: Role) {
  const { error } = await supabase.rpc("set_member_role", {
    p_org: orgId,
    p_user: userId,
    p_role: role,
  });
  if (error) throw error;
  return true;
}

/** Quita a un miembro (si RLS lo permite) */
export async function removeMember(orgId: string, userId: string) {
  const { error } = await supabase
    .from("memberships")
    .delete()
    .match({ org_id: orgId, user_id: userId });
  if (error) throw error;
  return true;
}

/** Obtiene el perfil del usuario actual (conveniencia) */
export async function getMyProfile() {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) throw userError;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user?.id ?? "")
    .maybeSingle();

  if (error) throw error;
  return data;
}

