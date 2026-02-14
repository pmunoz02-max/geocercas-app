// /api/auth/session.js
import { createClient } from "@supabase/supabase-js";

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

export default async function handler(req, res) {
  const build_tag = "session-v15-current-org-persist";

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
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: `Bearer ${access_token}` } },
    });

    // 1) Validar usuario
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

    // ============================
    // POST action=set_org (CANÓNICO)
    // ============================
    if (req.method === "POST") {
      const body = await jsonBody(req);
      const action = String(body?.action || "").toLowerCase();

      if (action === "set_org") {
        const orgId = body?.org_id ? String(body.org_id) : "";

        if (!orgId) {
          return res.status(400).json({
            build_tag,
            ok: false,
            error: "org_id is required",
          });
        }

        // Ejecuta RPC canónico: valida membresía y persiste org
        const { data: setData, error: setErr } = await sbUser.rpc("set_current_org", {
          p_org_id: orgId,
        });

        if (setErr) {
          return res.status(403).json({
            build_tag,
            ok: false,
            error: "Failed to set current org",
            details: safeError(setErr),
          });
        }

        return res.status(200).json({
          build_tag,
          ok: true,
          authenticated: true,
          user,
          current_org_id: setData || orgId,
        });
      }

      // Si no reconocemos la acción, respondemos claro
      return res.status(400).json({
        build_tag,
        ok: false,
        error: "Invalid action for POST. Use { action: 'set_org', org_id }",
      });
    }

    // 2) Bootstrap legacy (mejor esfuerzo; no bloquea sesión)
    try {
      const { error: berr } = await sbUser.rpc("bootstrap_user_context");
      if (berr) console.warn("[session] bootstrap_user_context error:", berr);
    } catch (e) {
      console.warn("[session] bootstrap_user_context threw:", e?.message || String(e));
    }

    // 3) Leer memberships CANÓNICA (solo user autenticado)
    const { data: memberships, error: merr } = await sbUser
      .from("memberships")
      .select("org_id, role, is_default, organizations(name)")
      .eq("user_id", user.id)
      .is("revoked_at", null);

    if (merr) {
      console.error("[session] memberships read error:", merr);
      return res.status(200).json({
        build_tag,
        authenticated: true,
        ok: true,
        user,
        organizations: [],
        current_org_id: null,
        role: null,
        memberships_error: safeError(merr),
      });
    }

    const orgsRaw = (memberships || []).map((m) => ({
      id: m.org_id,
      name: m.organizations?.name || "",
      role: m.role,
      is_default: !!m.is_default,
    }));

    const { orgs, defaultOrg } = normalizeDefault(orgsRaw);

    // ✅ NUEVO: persistir org activa en DB para que get_current_org_id() funcione en APIs
    // Solo si hay defaultOrg
    if (defaultOrg?.id) {
      try {
        const { error: setErr } = await sbUser.rpc("set_current_org", { p_org_id: defaultOrg.id });
        if (setErr) console.warn("[session] set_current_org error:", setErr);
      } catch (e) {
        console.warn("[session] set_current_org threw:", e?.message || String(e));
      }
    }

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
      build_tag,
      authenticated: false,
      ok: false,
      error: e?.message || String(e),
    });
  }
}
