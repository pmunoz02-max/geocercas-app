// src/services/admin.ts
// Ajusta la ruta si no usas alias "@"
import { supabase } from "@/lib/supabaseClient";

export type UUID = string;

export type Organization = {
  id: UUID;
  name: string;
  owner_id: UUID | null;
  created_at: string | null;
};

export type Profile = {
  id: UUID;
  email: string | null;
  full_name: string | null;
  role_id: UUID | null;
  org_id: UUID | null;
  created_at?: string | null;
};

function sbErrorPrefix(fn: string, err?: unknown) {
  const msg =
    (err as any)?.message ??
    (typeof err === "string" ? err : "Error");
  return `[${fn}] ${msg}`;
}

/**
 * Obtiene el perfil del usuario actual.
 * Sin depender de RPC: lee directamente de la tabla "profiles".
 */
export async function getMyProfile(): Promise<Profile | null> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError) throw new Error(sbErrorPrefix("getMyProfile/auth", authError));
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, role_id, org_id, created_at")
    .eq("id", user.id)
    .single();

  if (error) throw new Error(sbErrorPrefix("getMyProfile/select", error));
  return (data as Profile) ?? null;
}

/**
 * Crea una organización y asigna al usuario autenticado como OWNER
 * Requiere tablas:
 *  - organizations(id uuid pk, name text, owner_id uuid, created_at timestamptz)
 *  - user_organizations(id uuid pk, user_id uuid, org_id uuid, role text)
 */
export async function createOrganization(name: string): Promise<Organization> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError) throw new Error(sbErrorPrefix("createOrganization/auth", authError));
  if (!user) throw new Error("[createOrganization] No hay usuario autenticado.");

  // 1) Insert org
  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .insert({ name, owner_id: user.id })
    .select("id, name, owner_id, created_at")
    .single();

  if (orgError) throw new Error(sbErrorPrefix("createOrganization/insertOrg", orgError));

  // 2) Vincular OWNER en pivote
  const { error: uoError } = await supabase.from("user_organizations").insert({
    user_id: user.id,
    org_id: org!.id,
    role: "OWNER",
  });
  if (uoError) throw new Error(sbErrorPrefix("createOrganization/ownerLink", uoError));

  return org as Organization;
}

/**
 * Lista organizaciones del usuario autenticado SIN usar join/relación explícita.
 * Paso 1: obtener org_ids desde user_organizations
 * Paso 2: consultar organizations con .in('id', orgIds)
 */
export async function listMyOrganizations(): Promise<Organization[]> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError) throw new Error(sbErrorPrefix("listMyOrganizations/auth", authError));
  if (!user) return [];

  // 1) org_ids
  const { data: links, error: linkError } = await supabase
    .from("user_organizations")
    .select("org_id")
    .eq("user_id", user.id);

  if (linkError) throw new Error(sbErrorPrefix("listMyOrganizations/links", linkError));
  if (!links || links.length === 0) return [];

  const orgIds = links.map((l: { org_id: UUID }) => l.org_id);

  // 2) organizations
  const { data: orgs, error: orgError } = await supabase
    .from("organizations")
    .select("id, name, owner_id, created_at")
    .in("id", orgIds);

  if (orgError) throw new Error(sbErrorPrefix("listMyOrganizations/select", orgError));
  return (orgs ?? []) as Organization[];
}

/**
 * Asignar rol a un usuario en una organización.
 * Si tienes el RPC `admin_assign_role_org`, úsalo; de lo contrario, inserta/actualiza en pivote.
 */
export async function adminAssignRoleOrg(params: {
  target_user_id: UUID;
  org_id: UUID;
  role: "OWNER" | "ADMIN" | "TRACKER";
}): Promise<{ ok: true }> {
  // Intenta RPC si existe
  try {
    const { error } = await supabase.rpc("admin_assign_role_org", {
      target_user_id: params.target_user_id,
      org_id: params.org_id,
      role: params.role,
    });
    if (!error) return { ok: true };
    // si el RPC existe pero falla por otra causa:
    if (error && !/function .* does not exist/i.test(error.message)) {
      throw error;
    }
  } catch (e) {
    // si el catch no es por "no existe", continúa al fallback
    if (!(e as any)?.message?.match(/function .* does not exist/i)) {
      throw new Error(sbErrorPrefix("adminAssignRoleOrg/rpc", e));
    }
  }

  // Fallback directo a tabla pivote: upsert por (user_id, org_id)
  const { error: upsertError } = await supabase
    .from("user_organizations")
    .upsert(
      {
        user_id: params.target_user_id,
        org_id: params.org_id,
        role: params.role,
      },
      { onConflict: "user_id,org_id" }
    );

  if (upsertError) throw new Error(sbErrorPrefix("adminAssignRoleOrg/upsert", upsertError));
  return { ok: true };
}

/**
 * Enviar Magic Link mediante Edge Function `send-magic-link`
 * Requiere:
 *  - VITE_SUPABASE_URL
 *  - VITE_SUPABASE_ANON_KEY
 */
export async function sendMagicLink(email: string): Promise<{ ok: true }> {
  const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-magic-link`;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  const res = await fetch(fnUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`[sendMagicLink] HTTP ${res.status} ${text}`);
  }

  return { ok: true };
}
