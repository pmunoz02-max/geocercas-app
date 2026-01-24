// /api/admin/invite_new_admin.js
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
  const { httpOnly = true, secure = true, sameSite = "Lax", path = "/", maxAge } = opts;
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

export default async function handler(req, res) {
  const build_tag = "invite_new_admin-v1";

  try {
    if (req.method === "OPTIONS") {
      res.statusCode = 200;
      return res.end();
    }
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST,OPTIONS");
      return res.status(405).json({ ok: false, build_tag, error: "Method not allowed" });
    }

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");

    const url = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      return res.status(500).json({ build_tag, ok: false, error: "Missing SUPABASE_URL or SUPABASE_ANON_KEY" });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const email = String(body.email || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ build_tag, ok: false, error: "Email requerido" });

    const cookies = parseCookies(req.headers.cookie || "");
    let access_token = cookies.tg_at || "";
    const refresh_token = cookies.tg_rt || "";

    if (!access_token) {
      if (!refresh_token) return res.status(401).json({ build_tag, ok: false, error: "No autenticado" });

      const refreshed = await refreshAccessToken({ supabaseUrl: url, anonKey, refreshToken: refresh_token });
      access_token = refreshed.access_token;

      const accessMaxAge = Number(refreshed.expires_in || 3600);
      const refreshMaxAge = 30 * 24 * 60 * 60;

      res.setHeader("Set-Cookie", [
        makeCookie("tg_at", refreshed.access_token, { httpOnly: true, secure: true, sameSite: "Lax", path: "/", maxAge: accessMaxAge }),
        makeCookie("tg_rt", refreshed.refresh_token || refresh_token, { httpOnly: true, secure: true, sameSite: "Lax", path: "/", maxAge: refreshMaxAge }),
      ]);
    }

    // Validar usuario con access token
    let sbUser, user;
    {
      const r = await getUserFromAccessToken({ url, anonKey, accessToken: access_token });
      sbUser = r.sbUser;
      user = r.user;

      if (!user) {
        if (!refresh_token) return res.status(401).json({ build_tag, ok: false, error: "No autenticado" });

        const refreshed = await refreshAccessToken({ supabaseUrl: url, anonKey, refreshToken: refresh_token });
        access_token = refreshed.access_token;

        const accessMaxAge = Number(refreshed.expires_in || 3600);
        const refreshMaxAge = 30 * 24 * 60 * 60;

        res.setHeader("Set-Cookie", [
          makeCookie("tg_at", refreshed.access_token, { httpOnly: true, secure: true, sameSite: "Lax", path: "/", maxAge: accessMaxAge }),
          makeCookie("tg_rt", refreshed.refresh_token || refresh_token, { httpOnly: true, secure: true, sameSite: "Lax", path: "/", maxAge: refreshMaxAge }),
        ]);

        const r2 = await getUserFromAccessToken({ url, anonKey, accessToken: access_token });
        sbUser = r2.sbUser;
        user = r2.user;
      }
    }

    if (!user) return res.status(401).json({ build_tag, ok: false, error: "No autenticado" });

    // Llamar RPC como usuario autenticado (auth.uid() funciona)
    const { data, error } = await sbUser.rpc("admin_invite_new_admin", {
      p_email: email,
      p_role: "owner",
      p_org_name: null,
    });

    if (error) {
      return res.status(400).json({ build_tag, ok: false, error: error.message, details: error });
    }

    return res.status(200).json({ build_tag, ok: true, ...data });
  } catch (e) {
    return res.status(500).json({ ok: false, build_tag, error: String(e?.message || e) });
  }
}
