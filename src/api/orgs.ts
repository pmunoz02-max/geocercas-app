import { supabase } from "../supabaseClient";

const STORAGE_KEY = "current_org_id";

export function getCurrentOrgId(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function setCurrentOrgId(orgId: string | null) {
  if (orgId) localStorage.setItem(STORAGE_KEY, orgId);
  else localStorage.removeItem(STORAGE_KEY);
}

export async function fetchUserOrgs() {
  // Trae organizaciones donde el usuario autenticado es miembro
  // Asume vista/relación user_orgs (o usa org_memberships join organizations)
  const { data, error } = await supabase
    .from("user_orgs_view") // si no tienes la vista, reemplaza por un join en RPC o view existente
    .select("org_id:id, name")
    .order("name", { ascending: true });

  if (error) throw error;
  // Normaliza a [{ id, name }]
  return (data ?? []).map((r: any) => ({ id: r.org_id ?? r.id, name: r.name }));
}
