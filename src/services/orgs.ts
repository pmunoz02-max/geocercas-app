// src/services/orgs.ts
import { supabase } from "../supabaseClient";

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
  revoked_at?: string | null;
  is_default?: boolean;
  is_active?: boolean;
}

export type ActiveOrgResolutionStatus = "ready" | "bootstrap-required";

export interface ActiveOrgResolution {
  status: ActiveOrgResolutionStatus;
  activeOrgId: string | null;
  activeMembership: Membership | null;
  memberships: Membership[];
  canSwitchOrganizations: boolean;
}

type ListMyOrganizationsOptions = {
  forceRefresh?: boolean;
};

type ResolveActiveOrgOptions = {
  forceRefresh?: boolean;
  allowSwitchOrganizations?: boolean;
  preferredOrgId?: string | null;
};

type SelectActiveOrgOptions = {
  allowSwitchOrganizations?: boolean;
};

const ROLE_PRIORITY: Record<Role, number> = {
  owner: 4,
  admin: 3,
  viewer: 2,
  tracker: 1,
};

let membershipsCache: Membership[] | null = null;
let activeOrgIdState: string | null = null;
let membersCacheByOrg = new Map<string, MemberRow[]>();

function normalizeRole(value: unknown): Role {
  const role = String(value || "").trim().toLowerCase();
  if (role === "owner" || role === "admin" || role === "tracker" || role === "viewer") {
    return role;
  }
  return "viewer";
}

function toBoolLoose(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value !== "string") return null;
  const s = value.trim().toLowerCase();
  if (!s) return null;
  if (s === "1" || s === "true" || s === "yes" || s === "on") return true;
  if (s === "0" || s === "false" || s === "no" || s === "off") return false;
  return null;
}

function isRevokedMembership(raw: any): boolean {
  if (raw?.revoked_at != null) return true;

  const activeFlags = [raw?.is_active, raw?.active, raw?.membership_active]
    .map((v) => toBoolLoose(v))
    .filter((v): v is boolean => typeof v === "boolean");

  if (activeFlags.length > 0 && activeFlags.some((v) => v === false)) return true;

  const revokedFlags = [raw?.revoked, raw?.is_revoked, raw?.membership_revoked]
    .map((v) => toBoolLoose(v))
    .filter((v): v is boolean => typeof v === "boolean");

  return revokedFlags.some((v) => v === true);
}

function normalizeMembership(raw: any): Membership | null {
  const org_id = String(raw?.org_id ?? raw?.id ?? "").trim();
  const user_id = String(raw?.user_id ?? "").trim();
  if (!org_id || !user_id) return null;

  return {
    org_id,
    user_id,
    role: normalizeRole(raw?.role),
    created_at: String(raw?.created_at ?? ""),
    org_name: raw?.org_name ?? raw?.name ?? "",
    slug: raw?.slug ?? null,
    revoked_at: raw?.revoked_at ?? null,
    is_default: toBoolLoose(raw?.is_default) ?? false,
    is_active: toBoolLoose(raw?.is_active) ?? true,
  };
}

function membershipRank(m: Membership): number {
  const activeScore = m.revoked_at == null && m.is_active !== false ? 100 : 0;
  const defaultScore = m.is_default ? 10 : 0;
  const roleScore = ROLE_PRIORITY[m.role] ?? 0;
  return activeScore + defaultScore + roleScore;
}

function sortMembershipsDeterministically(rows: Membership[]): Membership[] {
  return [...rows].sort((a, b) => {
    const rankDiff = membershipRank(b) - membershipRank(a);
    if (rankDiff !== 0) return rankDiff;

    const dateA = Date.parse(a.created_at || "");
    const dateB = Date.parse(b.created_at || "");
    const safeDateA = Number.isNaN(dateA) ? 0 : dateA;
    const safeDateB = Number.isNaN(dateB) ? 0 : dateB;
    if (safeDateA !== safeDateB) return safeDateA - safeDateB;

    return a.org_id.localeCompare(b.org_id);
  });
}

function dedupeActiveMemberships(rawRows: any[]): Membership[] {
  const byOrg = new Map<string, Membership>();

  for (const raw of rawRows ?? []) {
    if (isRevokedMembership(raw)) continue;

    const normalized = normalizeMembership(raw);
    if (!normalized) continue;

    const existing = byOrg.get(normalized.org_id);
    if (!existing) {
      byOrg.set(normalized.org_id, normalized);
      continue;
    }

    if (membershipRank(normalized) > membershipRank(existing)) {
      byOrg.set(normalized.org_id, normalized);
    }
  }

  return sortMembershipsDeterministically(Array.from(byOrg.values()));
}

function pickDeterministicMembership(
  memberships: Membership[],
  preferredOrgId?: string | null,
  allowSwitchOrganizations?: boolean
): Membership | null {
  if (!Array.isArray(memberships) || memberships.length === 0) return null;
  if (memberships.length === 1) return memberships[0];

  const defaultMembership = memberships.find((m) => m.is_default);
  if (defaultMembership) return defaultMembership;

  if (allowSwitchOrganizations && preferredOrgId) {
    const preferred = memberships.find((m) => m.org_id === preferredOrgId);
    if (preferred) return preferred;
  }

  return memberships[0];
}

function setActiveOrgIdInternal(nextOrgId: string | null) {
  const previousOrgId = activeOrgIdState;
  const changed = previousOrgId !== nextOrgId;

  activeOrgIdState = nextOrgId;

  if (changed) {
    clearOrgScopedCache();
  }
}

export function getActiveOrgId(): string | null {
  return activeOrgIdState;
}

export function clearOrgScopedCache() {
  membersCacheByOrg = new Map<string, MemberRow[]>();
}

export function resetOrgState() {
  membershipsCache = null;
  setActiveOrgIdInternal(null);
}

export async function selectActiveOrg(
  orgId: string | null,
  options: SelectActiveOrgOptions = {}
): Promise<boolean> {
  if (!orgId) {
    setActiveOrgIdInternal(null);
    return true;
  }

  const memberships = await listMyOrganizations({ forceRefresh: false });
  const belongsToOrg = memberships.some((m) => m.org_id === orgId);
  if (!belongsToOrg) return false;

  const current = getActiveOrgId();
  const allowSwitchOrganizations = Boolean(options.allowSwitchOrganizations);

  if (!allowSwitchOrganizations && memberships.length > 1) {
    const deterministicOrgId = pickDeterministicMembership(memberships)?.org_id ?? null;
    if (orgId !== deterministicOrgId) return false;
  }

  if (
    !allowSwitchOrganizations &&
    current &&
    current !== orgId &&
    memberships.length > 1
  ) {
    return false;
  }

  setActiveOrgIdInternal(orgId);
  return true;
}

export async function resolveActiveOrg(
  options: ResolveActiveOrgOptions = {}
): Promise<ActiveOrgResolution> {
  const memberships = await listMyOrganizations({ forceRefresh: options.forceRefresh });
  const allowSwitchOrganizations = Boolean(options.allowSwitchOrganizations);

  if (memberships.length === 0) {
    setActiveOrgIdInternal(null);
    return {
      status: "bootstrap-required",
      activeOrgId: null,
      activeMembership: null,
      memberships,
      canSwitchOrganizations: false,
    };
  }

  const chosen = pickDeterministicMembership(
    memberships,
    options.preferredOrgId,
    allowSwitchOrganizations
  );

  const activeOrgId = chosen?.org_id ?? null;
  setActiveOrgIdInternal(activeOrgId);

  return {
    status: "ready",
    activeOrgId,
    activeMembership: chosen,
    memberships,
    canSwitchOrganizations: allowSwitchOrganizations && memberships.length > 1,
  };
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
  membershipsCache = null;
  return data as Organization;
}

/** Lista las organizaciones del usuario actual (vista my_memberships) */
export async function listMyOrganizations(
  options: ListMyOrganizationsOptions = {}
) {
  if (!options.forceRefresh && membershipsCache) {
    return membershipsCache;
  }

  const { data, error } = await supabase
    .from("my_memberships")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;

  const normalized = dedupeActiveMemberships(data ?? []);
  membershipsCache = normalized;

  if (normalized.length === 1 && !activeOrgIdState) {
    setActiveOrgIdInternal(normalized[0].org_id);
  }

  if (activeOrgIdState && !normalized.some((m) => m.org_id === activeOrgIdState)) {
    setActiveOrgIdInternal(normalized.length === 1 ? normalized[0].org_id : null);
  }

  return normalized;
}

/**
 * Lista miembros de una organización usando la VISTA members_with_profiles
 * (evita la necesidad de una FK directa memberships.user_id -> profiles.user_id)
 */
export async function listMembers(orgId: string) {
  if (!orgId) return [];

  if (membersCacheByOrg.has(orgId)) {
    return membersCacheByOrg.get(orgId) ?? [];
  }

  const memberships = await listMyOrganizations({ forceRefresh: false });
  const hasActiveMembership = memberships.some((m) => m.org_id === orgId);
  if (!hasActiveMembership) {
    return [];
  }

  const { data, error } = await supabase
    .from("members_with_profiles")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });

  if (error) throw error;

  const rows = (data ?? []).map((r: any) => ({
    org_id: r.org_id,
    user_id: r.user_id,
    role: r.role as Role,
    created_at: r.created_at,
    profiles: {
      full_name: r.full_name ?? "(sin nombre)",
      avatar_url: r.avatar_url ?? null,
    },
  })) as MemberRow[];

  membersCacheByOrg.set(orgId, rows);
  return rows;
}

/** Cambia rol (solo owner/admin) – RPC set_member_role */
export async function setMemberRole(orgId: string, userId: string, role: Role) {
  const { error } = await supabase.rpc("set_member_role", {
    p_org: orgId,
    p_user: userId,
    p_role: role,
  });
  if (error) throw error;
  membersCacheByOrg.delete(orgId);
  return true;
}

/** Quita a un miembro (si RLS lo permite) - uses safe RPC with revocation pattern */
export async function removeMember(orgId: string, userId: string) {
  const { error } = await supabase.rpc("remove_member", {
    p_org: orgId,
    p_user: userId,
  });
  if (error) throw error;
  membersCacheByOrg.delete(orgId);
  membershipsCache = null;
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

