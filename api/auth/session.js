// /api/auth/session.js
import { createClient } from "@supabase/supabase-js";

/* ---------- helpers cookies ---------- */
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

/* ---------- auth helpers ---------- */
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

  const json = await r.json().catch(() => ({}));
  if (!r.ok || !json?.access_token) {
    const err = new Error(
      json?.error_description || json?.error || "Failed to refresh token"
    );
    err.status = 401;
    throw err;
  }
  return json;
}

async function getUserFromAccessToken({ url, anonKey, accessToken }) {
  const sbUser = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  const { data, error } = await sbUser.auth.getUser();
  const user = data?.user ? { id: data.user.id, email: data.user.email } : null;
  return { sbUser, user, error };
}

/* ---------- ROOT CHECK ---------- */
async function isAppRoot({ url, serviceKey, userId }) {
  if (!serviceKey || !userId) return false;

  const sbAdmin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data } = await sbAdmin
    .from("app_root_users")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  return Boolean(data);
}

/* ---------- handler ---------- */
export default async function handler(req, res) {
  // increment if you want to visually confirm the deployed file
  const build_tag = "session-v13-root-aware";

  try {
    if (req.method === "OPTIONS") {
      res.status(200);
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

    // Refresh if needed
    if (!access_token && refresh_token) {
      const refreshed = await refreshAccessToken({
        supabaseUrl: url,
        anonKey,
        refreshToken: refresh_token,
      });

      access_token = refreshed.access_token;

      res.setHeader("Set-Cookie", [
        makeCookie("tg_at", refreshed.access_token, {
          maxAge: Number(refreshed.expires_in || 3600),
        }),
        makeCookie("tg_rt", refreshed.refresh_token || refresh_token, {
          maxAge: 30 * 24 * 60 * 60,
        }),
      ]);
    }

    // Resolve user
    const r1 = await getUserFromAccessToken({ url, anonKey, accessToken: access_token });
    const { sbUser, user } = r1;

    if (!user) {
      return res.status(200).json({ build_tag, authenticated: false });
    }

    // ROOT flag (only app owner sees ADMIN tab)
    const appRoot = await isAppRoot({
      url,
      serviceKey,
      userId: user.id,
    });

    /* ---------- BOOTSTRAP (RLS-safe via RPC) ---------- */
    const { data: boot } = await sbUser.rpc("bootstrap_session_context");

    if (Array.isArray(boot) && boot[0]?.org_id && boot[0]?.role) {
      return res.status(200).json({
        build_tag,
        authenticated: true,
        bootstrapped: true,
        user,
        current_org_id: boot[0].org_id,
        role: boot[0].role,
        is_app_root: appRoot,
      });
    }

    /* ---------- FALLBACK (service role) ---------- */
    let fallback = { current_org_id: null, role: null };

    if (serviceKey) {
      const sbAdmin = createClient(url, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      const { data } = await sbAdmin
        .from("app_user_roles")
        .select("org_id, role")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      fallback.current_org_id = data?.org_id || null;
      fallback.role = data?.role || null;
    }

    return res.status(200).json({
      build_tag,
      authenticated: true,
      bootstrapped: false,
      user,
      current_org_id: fallback.current_org_id,
      role: fallback.role,
      is_app_root: appRoot,
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
