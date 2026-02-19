// /api/auth/session.js
import { createClient } from "@supabase/supabase-js";

/**
 * /api/auth/session (READ-ONLY on GET)
 * - Fuente de verdad: Cookie HttpOnly tg_at
 * - GET: valida token y devuelve user + memberships + current_org_id (sin side-effects)
 * - POST { action: "set_org", org_id }: persiste org activa via RPC set_current_org (canónico)
 *
 * BUILD: session-v16-readonly-get-explicit-jwt
 */

function getCookie(req, name) {
  const raw = req?.headers?.cookie || "";
  const parts = raw
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
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

function normalizeDefault(orgs) {
  if (!Array.isArray(orgs) || orgs.length === 0) return { orgs: [], defaultOrg: null };

  const defaults = orgs.filter((o) => !!o.is_default);
  if (defaults.length === 1) return { orgs, defaultOrg: defaults[0] };

  // Si hay 0 o >1 defaults, escogemos el primero como default "de salida"
  const chosen = orgs[0];
  const fixed = orgs.map((o) => ({ ...o, is_default: o.id === chosen.id }));
  return { orgs: fixed, defaultOrg: chosen };
}

function jsonBody(req) {
  return new Promise((resolve) => {
    try {
      let data = "";
      req.on("data", (chunk) => (data += chunk));
      req.on("end", () => {
        try {
          resolve(data ? JSON.parse(data) : {});
        } catch {
          resolve({});
        }
      });
    } catch {
      resolve({});
    }
  });
}

function projectRefFromUrl(u) {
  try {
    return new URL(u).hostname.split(".")[0] || "";
  } catch {
    return "";
  }
}

export default async function handler(req, res) {
  const build_tag = "session-v16-readonly-get-explicit-jwt";

  try {
    // Preferimos SIEMPRE vars server-side. (Las VITE_* son front-build y pueden inducir mezcla.)
    const url =
      process.env.SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.VITE_SUPABASE_URL;

    const anonKey =
      process.env.SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY;

    if (!url || !anonKey) {
      return res.status(503).json({
        build_tag,
        ok: false,
        authenticated: false,
        error: "Missing SUPABASE env vars (SUPABASE_URL / SUPABASE_ANON_KEY)",
      });
    }

    const supabase_project_ref = projectRefFromUrl(url);

    const access_token = getCookie(req, "tg_at");

    // Sin cookie => no autenticado (pero ok)
    if (!access_token) {
      return res.status(200).json({
        build_tag,
        ok: true,
        authenticated: false,
        supabase_project_ref,
      });
    }

    // Cliente “stateless” para serverless
    const sb = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: `Bearer ${access_token}` } },
    });

    // 1) Validar usuario (JWT EXPLÍCITO => robusto)
    const { data: u1, error: uerr } = await sb.auth.getUser(access_token);
    const user = u1?.user ? { id: u1.user.id, email: u1.user.email } : null;

    if (!user || uerr) {
      return res.status(200).json({
        build_tag,
        ok: true,
        authenticated: false,
        reason: "INVALID_OR_EXPIRED_TOKEN",
        auth_error: safeError(uerr),
        supabase_project_ref,
      });
    }

    // ============================
    // POST action=set_org (CANÓNICO)
    // ============================
    if (req.method === "POST") {
      const body = await jsonBody(req);
      const action = String(body?.action || "").toLowerCase();

      if (action !== "set_org") {
        return res.status(400).json({
          build_tag,
          ok: false,
          authenticated: true,
          user,
          error: "Invalid action for POST. Use { action: 'set_org', org_id }",
          supabase_project_ref,
        });
      }

      const orgId = body?.org_id ? String(body.org_id) : "";
      if (!orgId) {
        return res.status(400).json({
          build_tag,
          ok: false,
          authenticated: true,
          user,
          error: "org_id is required",
          supabase_project_ref,
        });
      }

      const { data: setData, error: setErr } = await sb.rpc("set_current_org", {
        p_org_id: orgId,
      });

      if (setErr) {
        return res.status(403).json({
          build_tag,
          ok: false,
          authenticated: true,
          user,
          error: "Failed to set current org",
          details: safeError(setErr),
          supabase_project_ref,
        });
      }

      return res.status(200).json({
        build_tag,
        ok: true,
        authenticated: true,
        user,
        current_org_id: setData || orgId,
        supabase_project_ref,
      });
    }

    // GET (READ-ONLY): NO bootstrap, NO set_current_org aquí.

    // 2) Leer memberships
    const { data: memberships, error: merr } = await sb
      .from("memberships")
      .select("org_id, role, is_default, organizations(name)")
      .eq("user_id", user.id)
      .is("revoked_at", null);

    if (merr) {
      return res.status(200).json({
        build_tag,
        ok: true,
        authenticated: true,
        user,
        organizations: [],
        current_org_id: null,
        role: null,
        memberships_error: safeError(merr),
        supabase_project_ref,
      });
    }

    const orgsRaw = (memberships || []).map((m) => ({
      id: m.org_id,
      name: m.organizations?.name || "",
      role: m.role,
      is_default: !!m.is_default,
    }));

    const { orgs, defaultOrg } = normalizeDefault(orgsRaw);

    // 3) Leer org actual persistida (si tu RPC existe). Si no existe/da error => fallback a defaultOrg.
    let currentOrgId = null;
    try {
      const { data: cur, error: curErr } = await sb.rpc("get_current_org_id");
      if (!curErr && cur) currentOrgId = String(cur);
    } catch {
      // ignore
    }

    if (!currentOrgId && defaultOrg?.id) currentOrgId = defaultOrg.id;

    // role asociado a current org si existe
    const currentRole =
      currentOrgId && orgs?.length
        ? (orgs.find((o) => o.id === currentOrgId)?.role || null)
        : (defaultOrg?.role || null);

    return res.status(200).json({
      build_tag,
      ok: true,
      authenticated: true,
      user,
      organizations: orgs,
      current_org_id: currentOrgId,
      role: currentRole,
      supabase_project_ref,
    });
  } catch (e) {
    console.error("[/api/auth/session] fatal:", e);
    return res.status(500).json({
      build_tag,
      ok: false,
      authenticated: false,
      error: e?.message || String(e),
    });
  }
}
