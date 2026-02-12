// /api/auth/session.js
import { createClient } from "@supabase/supabase-js";

function getCookie(req, name) {
  const raw = req?.headers?.cookie || "";
  const parts = raw.split(";").map((s) => s.trim()).filter(Boolean);
  const hit = parts.find((p) => p.startsWith(name + "="));
  return hit ? decodeURIComponent(hit.split("=").slice(1).join("=")) : null;
}

function safeError(err) {
  if (!err) return null;
  return {
    message: err.message,
    code: err.code,
    details: err.details,
    hint: err.hint,
    status: err.status,
  };
}

export default async function handler(req, res) {
  const build_tag = "session-v13-memberships-canonical";

  try {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

    if (!url || !anonKey) {
      return res.status(503).json({
        build_tag,
        authenticated: false,
        ok: false,
        error: "Missing SUPABASE env vars",
      });
    }

    const access_token = getCookie(req, "tg_at");

    if (!access_token) {
      return res.status(200).json({
        build_tag,
        authenticated: false,
        ok: true,
      });
    }

    const sbUser = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${access_token}` } },
    });

    // 1️⃣ Validar usuario
    const { data: u1, error: uerr } = await sbUser.auth.getUser();
    const user = u1?.user ? { id: u1.user.id, email: u1.user.email } : null;

    if (!user || uerr) {
      return res.status(200).json({
        build_tag,
        authenticated: false,
        ok: true,
        reason: "INVALID_OR_EXPIRED_TOKEN",
        auth_error: safeError(uerr),
      });
    }

    // 2️⃣ Bootstrap universal (la función correcta)
    const { data: boot, error: berr } =
      await sbUser.rpc("bootstrap_user_context");

    if (berr) {
      console.warn("[session] bootstrap_user_context error:", berr);
    }

    // 3️⃣ Leer memberships canónica
    const { data: memberships, error: merr } = await sbUser
      .from("memberships")
      .select("org_id, role, is_default, organizations(name)")
      .is("revoked_at", null);

    if (merr) {
      console.error("[session] memberships read error:", merr);
    }

    const orgs = (memberships || []).map((m) => ({
      id: m.org_id,
      name: m.organizations?.name || "",
      role: m.role,
      is_default: m.is_default,
    }));

    const defaultOrg =
      orgs.find((o) => o.is_default) || orgs[0] || null;

    return res.status(200).json({
      build_tag,
      authenticated: true,
      ok: true,
      user,
      organizations: orgs,
      current_org_id: defaultOrg?.id || null,
      role: defaultOrg?.role || null,
    });
  } catch (e) {
    console.error("[/api/auth/session] fatal:", e);
    return res.status(500).json({
      build_tag: "session-v13-memberships-canonical",
      authenticated: false,
      ok: false,
      error: e?.message || String(e),
    });
  }
}
