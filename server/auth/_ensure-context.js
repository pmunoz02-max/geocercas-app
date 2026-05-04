// Construye un contexto vacío si el usuario no tiene memberships
function buildNoOrgContext(user) {
  return {
    org_id: null,
    active_org_id: null,
    current_org_id: null,
    role: null,
    current_role: null,
    created: false,
    source: "no_membership",
    code: "NO_ORG_CONTEXT",
    no_org_context: true,
    current_org: null,
    organizations: [],
    membership_count: 0,
    can_switch_organizations: false,
    user_email: user?.email || null,
  };
}
// api/auth/ensure-context.js
import { createClient } from "@supabase/supabase-js";

function getCookie(req, name) {
  const cookie = req.headers?.cookie || "";
  const parts = cookie.split(";").map((p) => p.trim());
  for (const p of parts) {
    if (p.startsWith(name + "=")) return decodeURIComponent(p.slice(name.length + 1));
  }
  return "";
}

function isNoRowsError(err) {
  if (!err) return false;
  const code = String(err.code || "");
  const msg = String(err.message || "").toLowerCase();
  return code === "PGRST116" || msg.includes("0 rows") || msg.includes("no rows");
}

function normalizeRole(role) {
  if (!role) return null;
  return String(role).trim().toLowerCase();
}

function sanitizeSlug(input) {
  return String(input || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 56);
}

function buildBootstrapSlug(userId) {
  const compactId = String(userId || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return `u-${compactId}`.slice(0, 60);
}

function buildBootstrapOrgName(user) {
  const email = String(user?.email || "");
  const local = sanitizeSlug(email.split("@")[0] || "");
  if (local) return `${local}-organization`;
  const suffix = String(user?.id || "").slice(0, 8) || "user";
  return `organization-${suffix}`;
}

function pickActiveMembership(memberships) {
  if (!Array.isArray(memberships) || memberships.length === 0) return null;
  const explicitDefault = memberships.find((m) => !!m?.is_default);
  return explicitDefault || memberships[0] || null;
}

async function loadActiveMemberships(sb, userId) {
  const { data, error } = await sb
    .from("memberships")
    .select("org_id, role, is_default, created_at, organizations(id, name, slug)")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data || [];
}

function mapMembershipToOrg(membership) {
  const orgId = membership?.org_id ?? membership?.organizations?.id ?? null;
  if (!orgId) return null;

  return {
    id: orgId,
    name: membership?.organizations?.name || "",
    slug: membership?.organizations?.slug || null,
    role: normalizeRole(membership?.role),
    is_default: !!membership?.is_default,
  };
}

function isOwnedByUser(org, userId) {
  if (!org?.id || !userId) return false;
  return String(org.owner_id || "") === String(userId);
}

async function setCurrentOrgBestEffort(sb, orgId) {
  if (!orgId) return false;

  const attempts = [
    ["set_current_org", { p_org: orgId }],
    ["set_current_org", { p_org_id: orgId }],
    ["rpc_set_current_org", { p_org_id: orgId }],
    ["rpc_set_current_org", { p_org: orgId }],
  ];

  for (const [rpcName, args] of attempts) {
    try {
      const { error } = await sb.rpc(rpcName, args);
      if (!error) return true;
    } catch {
      // ignore and try next signature
    }
  }

  return false;
}

async function ensureDefaultMembershipBestEffort(sb, userId, orgId) {
  if (!userId || !orgId) return;

  try {
    await sb
      .from("memberships")
      .update({ is_default: false })
      .eq("user_id", userId)
      .is("revoked_at", null)
      .neq("org_id", orgId);
  } catch {
    // best effort only
  }

  try {
    await sb
      .from("memberships")
      .update({ is_default: true })
      .eq("user_id", userId)
      .eq("org_id", orgId)
      .is("revoked_at", null);
  } catch {
    // best effort only
  }
}

async function findOrganizationBySlug(sb, slug) {
  const { data, error } = await sb
    .from("organizations")
    .select("id, name, slug, owner_id, created_at")
    .eq("slug", slug)
    .maybeSingle();

  if (error && !isNoRowsError(error)) throw error;
  return data || null;
}

async function findOwnedOrganization(sb, userId) {
  const { data, error } = await sb
    .from("organizations")
    .select("id, name, slug, owner_id, created_at")
    .eq("owner_id", userId)
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) throw error;
  return Array.isArray(data) && data.length > 0 ? data[0] : null;
}

async function createOrganizationViaRpc(sb, name, slug) {
  const { data, error } = await sb.rpc("create_organization", {
    p_name: name,
    p_slug: slug,
  });
  if (error) throw error;
  return data?.id || null;
}

async function ensureOwnerMembership(sb, userId, orgId) {
  const payload = {
    org_id: orgId,
    user_id: userId,
    role: "owner",
    is_default: true,
    revoked_at: null,
  };

  const attempts = ["user_id,org_id", "org_id,user_id"];

  for (const onConflict of attempts) {
    const { error } = await sb.from("memberships").upsert([payload], { onConflict });
    if (!error) return;
  }

  throw new Error("failed to ensure owner membership for user");
}

async function buildResolvedContext(sb, userId, orgId, { created, source } = {}) {
  await ensureDefaultMembershipBestEffort(sb, userId, orgId);
  await setCurrentOrgBestEffort(sb, orgId);

  const memberships = await loadActiveMemberships(sb, userId);
  const selected = memberships.find((membership) => membership?.org_id === orgId) || pickActiveMembership(memberships);
  if (!selected?.org_id) {
    throw new Error("failed to resolve active membership for user");
  }

  const organizations = memberships.map(mapMembershipToOrg).filter(Boolean);
  const currentOrg =
    organizations.find((organization) => organization.id === selected.org_id) ||
    mapMembershipToOrg(selected) ||
    { id: selected.org_id, name: "", slug: null, role: normalizeRole(selected.role), is_default: !!selected.is_default };

  return {
    org_id: selected.org_id,
    active_org_id: selected.org_id,
    current_org_id: selected.org_id,
    role: normalizeRole(selected.role),
    current_role: normalizeRole(selected.role),
    created: !!created,
    source,
    active_membership: {
      org_id: selected.org_id,
      role: normalizeRole(selected.role),
      is_default: !!selected.is_default,
    },
    current_org: currentOrg,
    organizations,
    membership_count: organizations.length,
    can_switch_organizations: organizations.length > 1,
  };
}

async function ensureContextForUser(sb, user) {
  const userId = user?.id;
  if (!userId) throw new Error("missing user id");

  const activeMemberships = await loadActiveMemberships(sb, userId);
  const existing = pickActiveMembership(activeMemberships);

  if (existing?.org_id) {
    return buildResolvedContext(sb, userId, existing.org_id, {
      created: false,
      source: "existing_membership",
    });
  }

  // Si no hay memberships, NO crear organización automática
  return buildNoOrgContext(user);
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "method_not_allowed" });
    }

    const tg_at = getCookie(req, "tg_at");
    if (!tg_at) {
      return res.status(401).json({ ok: false, error: "missing tg_at cookie" });
    }

    const url = process.env.SUPABASE_URL;
    const anon = process.env.SUPABASE_ANON_KEY;

    if (!url || !anon) {
      return res.status(503).json({
        ok: false,
        authenticated: false,
        error: "Missing SUPABASE_URL / SUPABASE_ANON_KEY in server environment",
      });
    }

    const sb = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${tg_at}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } = await sb.auth.getUser(tg_at);
    const user = authData?.user || null;

    if (authError || !user?.id) {
      return res.status(401).json({
        ok: false,
        error: authError?.message || "invalid_user_session",
      });
    }

    const context = await ensureContextForUser(sb, user);
    if (context?.no_org_context) {
      return res.status(200).json({
        ok: false,
        authenticated: true,
        code: "NO_ORG_CONTEXT",
        data: context,
      });
    }
    return res.status(200).json({ ok: true, data: context });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || "server_error" });
  }
}
