// src/server/lib/resolveOrg.js
import { createClient } from "@supabase/supabase-js";

const VERSION = "resolveOrg-v3-canonical-memberships-server-side";

// Helpers
function parseCookie(header = "") {
  const out = {};
  const parts = String(header).split(";");
  for (const p of parts) {
    const idx = p.indexOf("=");
    if (idx === -1) continue;
    const k = p.slice(0, idx).trim();
    const v = p.slice(idx + 1).trim();
    if (!k) continue;
    out[k] = decodeURIComponent(v);
  }
  return out;
}

function bearerFromAuthHeader(req) {
  const h = req?.headers?.authorization || req?.headers?.Authorization;
  if (!h) return null;
  const m = String(h).match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

function tokenFromCookie(req) {
  const cookies = parseCookie(req?.headers?.cookie || "");
  return cookies.tg_at || null;
}

function supabaseUrl() {
  return process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
}

function supabaseAnonKey() {
  return process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
}

function jsonError(status, error, details) {
  return { ok: false, status, error, details, version: VERSION };
}

/**
 * Canonical resolver: multi-tenant via public.memberships (server-side).
 * - NO confía en org_id del frontend (ni body, ni query).
 * - Prefiere Authorization: Bearer <token>
 * - Fallback: cookie HttpOnly tg_at
 *
 * Retorna:
 *  { ok:true, org_id, role, supabase }
 *  { ok:false, status, error, details }
 */
export async function resolveOrgAndMembership(req, res) {
  try {
    const url = supabaseUrl();
    const anon = supabaseAnonKey();
    if (!url || !anon) {
      return jsonError(500, "Server misconfigured", {
        hint: "Missing SUPABASE_URL / SUPABASE_ANON_KEY (or VITE_ equivalents).",
      });
    }

    // 1) Token: Bearer preferido, cookie fallback
    const token = bearerFromAuthHeader(req) || tokenFromCookie(req);
    if (!token) {
      return jsonError(401, "Unauthorized", { hint: "Missing Bearer token or tg_at cookie." });
    }

    // 2) Cliente de queries (debe tener .from)
    const supabase = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    if (typeof supabase?.from !== "function") {
      return jsonError(500, "Server misconfigured", {
        hint: "Supabase client missing .from(). Check @supabase/supabase-js import/version.",
      });
    }

    // 3) Validar usuario (server-side)
    const { data: u, error: uerr } = await supabase.auth.getUser();
    if (uerr || !u?.user?.id) {
      return jsonError(401, "Unauthorized", { message: uerr?.message || "Invalid session" });
    }
    const user_id = u.user.id;

    // 4) Resolver org_id sin confiar en query/body:
    //    - Si hubiera más de una org, usamos default o la primera activa.
    //    - requestedOrgId (si lo usabas antes) queda eliminado del patrón canónico.
    //      (si en el futuro quieres selector org, se resuelve server-side con política,
    //       pero NO vía body/query como "fuente de verdad".)

    // 4.1 Default
    let { data: mDefault, error: mErr } = await supabase
      .from("memberships")
      .select("org_id, role, is_default, revoked_at")
      .eq("user_id", user_id)
      .eq("is_default", true)
      .is("revoked_at", null)
      .maybeSingle();

    if (mErr) {
      return jsonError(500, "Membership lookup failed", { message: mErr.message, details: mErr.details });
    }

    // 4.2 Fallback: primera org activa
    if (!mDefault?.org_id) {
      const { data: mAny, error: mAnyErr } = await supabase
        .from("memberships")
        .select("org_id, role, is_default, revoked_at, created_at")
        .eq("user_id", user_id)
        .is("revoked_at", null)
        .order("created_at", { ascending: true })
        .limit(1);

      if (mAnyErr) {
        return jsonError(500, "Membership lookup failed", { message: mAnyErr.message, details: mAnyErr.details });
      }
      if (Array.isArray(mAny) && mAny.length) mDefault = mAny[0];
    }

    if (!mDefault?.org_id) {
      return jsonError(403, "No organization membership", {
        hint: "User has no active membership (revoked_at is null).",
        user_id,
      });
    }

    return {
      ok: true,
      org_id: mDefault.org_id,
      role: mDefault.role || "viewer",
      supabase,
      version: VERSION,
    };
  } catch (e) {
    return jsonError(500, "Server error", { message: e?.message || String(e) });
  }
}
