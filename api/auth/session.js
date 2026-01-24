// /api/auth/session.js
import { createClient } from "@supabase/supabase-js";

/** Minimal cookie parser (no deps) */
function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  const parts = cookieHeader.split(";");
  for (const p of parts) {
    const i = p.indexOf("=");
    if (i === -1) continue;
    const k = p.slice(0, i).trim();
    const v = p.slice(i + 1).trim();
    if (!k) continue;
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

function makeCookie(name, value, opts = {}) {
  const {
    httpOnly = true,
    secure = true,
    sameSite = "Lax",
    path = "/",
    maxAge,
  } = opts;

  let s = `${name}=${encodeURIComponent(value ?? "")}`;
  if (path) s += `; Path=${path}`;
  if (typeof maxAge === "number") s += `; Max-Age=${maxAge}`;
  if (sameSite) s += `; SameSite=${sameSite}`;
  if (secure) s += `; Secure`;
  if (httpOnly) s += `; HttpOnly`;
  return s;
}

async function refreshAccessToken({ supabaseUrl, anonKey, refreshToken }) {
  const url = `${String(supabaseUrl).replace(/\/$/, "")}/auth/v1/token?grant_type=refresh_token`;

  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  const text = await r.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }

  if (!r.ok || !json?.access_token) {
    const msg = json?.error_description || json?.error || "Failed to refresh token";
    const err = new Error(msg);
    err.status = 401;
    err.body = json || null;
    throw err;
  }

  return json; // {access_token, refresh_token, expires_in, user, ...}
}

async function getUserFromAccessToken({ url, anonKey, accessToken }) {
  const sbUser = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  const { data: u1, error: uerr1 } = await sbUser.auth.getUser();
  const user = u1?.user ? { id: u1.user.id, email: u1.user.email } : null;
  return { sbUser, user, error: uerr1 };
}

function computeIsAppRoot({ userEmail, roleFromBoot }) {
  const role = String(roleFromBoot || "").toLowerCase();
  if (role === "root" || role === "root_owner") return true;

  const listRaw = process.env.APP_ROOT_EMAILS || "";
  const allow = listRaw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (!allow.length) return false;
  return allow.includes(String(userEmail || "").toLowerCase());
}

export default async function handler(req, res) {
  const build_tag = "session-v13-rootflag-orgs";

  try {
    // Solo GET/OPTIONS
    if (req.method === "OPTIONS") {
      res.statusCode = 200;
      return res.end();
    }
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET,OPTIONS");
      return res.status(405).json({ ok: false, build_tag, error: "Method not allowed" });
    }

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");

    const url = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !anonKey) {
      return res.status(500).json({
        build_tag,
        authenticated: false,
        error: "Missing SUPABASE_URL or SUPABASE_ANON_KEY",
      });
    }

    const cookies = parseCookies(req.headers.cookie || "");
    let access_token = cookies.tg_at || "";
    const refresh_token = cookies.tg_rt || "";

    // Si no hay access, intenta refresh (si hay refresh)
    if (!access_token) {
      if (!refresh_token) return res.status(200).json({ build_tag, authenticated: false });

      try {
        const refreshed = await refreshAccessToken({
          supabaseUrl: url,
          anonKey,
          refreshToken: refresh_token,
        });

        access_token = refreshed.access_token;

        // Actualiza cookies
        const accessMaxAge = Number(refreshed.expires_in || 3600);
        const refreshMaxAge = 30 * 24 * 60 * 60;

        res.setHeader("Set-Cookie", [
          makeCookie("tg_at", refreshed.access_token, {
            httpOnly: true,
            secure: true,
            sameSite: "Lax",
            path: "/",
            maxAge: accessMaxAge,
          }),
          makeCookie("tg_rt", refreshed.refresh_token || refresh_token, {
            httpOnly: true,
            secure: true,
            sameSite: "Lax",
            path: "/",
            maxAge: refreshMaxAge,
          }),
        ]);
      } catch {
        return res.status(200).json({ build_tag, authenticated: false });
      }
    }

    // 1) Validar sesión con JWT del usuario
    let sbUser, user, uerr1;
    {
      const r = await getUserFromAccessToken({ url, anonKey, accessToken: access_token });
      sbUser = r.sbUser;
      user = r.user;
      uerr1 = r.error;
    }

    // Si el access expiró/invalidó, intenta refresh UNA vez
    if (!user || uerr1) {
      if (!refresh_token) return res.status(200).json({ build_tag, authenticated: false });

      try {
        const refreshed = await refreshAccessToken({
          supabaseUrl: url,
          anonKey,
          refreshToken: refresh_token,
        });

        access_token = refreshed.access_token;

        const accessMaxAge = Number(refreshed.expires_in || 3600);
        const refreshMaxAge = 30 * 24 * 60 * 60;

        res.setHeader("Set-Cookie", [
          makeCookie("tg_at", refreshed.access_token, {
            httpOnly: true,
            secure: true,
            sameSite: "Lax",
            path: "/",
            maxAge: accessMaxAge,
          }),
          makeCookie("tg_rt", refreshed.refresh_token || refresh_token, {
            httpOnly: true,
            secure: true,
            sameSite: "Lax",
            path: "/",
            maxAge: refreshMaxAge,
          }),
        ]);

        const r2 = await getUserFromAccessToken({ url, anonKey, accessToken: access_token });
        sbUser = r2.sbUser;
        user = r2.user;
      } catch {
        return res.status(200).json({ build_tag, authenticated: false });
      }
    }

    if (!user) return res.status(200).json({ build_tag, authenticated: false });

    // 2) BOOTSTRAP UNIVERSAL (canónico)
    const { data: boot, error: berr } = await sbUser.rpc("bootstrap_session_context");

    if (!berr && Array.isArray(boot) && boot[0]?.org_id && boot[0]?.role) {
      const current_org_id = boot[0].org_id;
      const role = String(boot[0].role || "").toLowerCase();
      const is_app_root = computeIsAppRoot({ userEmail: user.email, roleFromBoot: role });

      return res.status(200).json({
        build_tag,
        authenticated: true,
        bootstrapped: true,
        user,
        current_org_id,
        role,
        is_app_root,
        organizations: [{ id: current_org_id }],
      });
    }

    // 3) Fallback con service role (si existe)
    let fallback = { current_org_id: null, role: null };

    if (serviceKey) {
      const sbAdmin = createClient(url, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      const { data: r1 } = await sbAdmin
        .from("app_user_roles")
        .select("org_id, role")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      fallback.current_org_id = r1?.org_id || null;
      fallback.role = r1?.role || null;
    }

    const is_app_root = computeIsAppRoot({ userEmail: user.email, roleFromBoot: fallback.role });

    return res.status(200).json({
      build_tag,
      authenticated: true,
      bootstrapped: false,
      user,
      current_org_id: fallback.current_org_id,
      role: fallback.role ? String(fallback.role).toLowerCase() : null,
      is_app_root,
      organizations: fallback.current_org_id ? [{ id: fallback.current_org_id }] : [],
      bootstrap_error: berr
        ? { message: berr.message, code: berr.code, details: berr.details, hint: berr.hint }
        : null,
      warning: "bootstrap_session_context failed; served fallback",
    });
  } catch (e) {
    console.error("[/api/auth/session] fatal:", e);
    return res.status(500).json({
      build_tag,
      authenticated: false,
      error: e?.message || String(e),
    });
  }
}
