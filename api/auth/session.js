// api/auth/session.js
import { createClient } from "@supabase/supabase-js";

export const config = { runtime: "nodejs" };

function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  for (const p of cookieHeader.split(";")) {
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

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function safeJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string" && req.body.trim()) {
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  }
  return {};
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

  return json;
}

async function getUserFromAccessToken({ url, anonKey, accessToken }) {
  const sbUser = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const { data } = await sbUser.auth.getUser();
  return { sbUser, user: data?.user || null };
}

async function computeIsAppRoot({ userEmail, roleFromBoot, serviceClient }) {
  const role = String(roleFromBoot || "").toLowerCase();
  if (role === "root" || role === "root_owner") return true;

  const email = normalizeEmail(userEmail);

  const envRaw = process.env.APP_ROOT_EMAILS || "";
  const envList = envRaw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (envList.includes(email)) return true;

  if (serviceClient) {
    const { data } = await serviceClient
      .from("app_root_users")
      .select("email")
      .eq("email", email)
      .maybeSingle();
    if (data) return true;
  }

  return false;
}

async function callEdgeInviteAdmin({ supabaseUrl, userAccessToken, payload }) {
  // OJO: nombre EXACTO de tu Edge Function
  const fnName = "invite_admin";
  const url = `${String(supabaseUrl).replace(/\/$/, "")}/functions/v1/${fnName}`;

  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Edge function valida identity del invitador con este JWT
      Authorization: `Bearer ${userAccessToken}`,
    },
    body: JSON.stringify(payload),
  });

  const text = await r.text().catch(() => "");
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { ok: false, error: "Invalid JSON from edge", raw: text };
  }

  if (!r.ok || !json?.ok) {
    const err = new Error(json?.message || json?.error || `Edge invite_admin failed (HTTP ${r.status})`);
    err.status = r.status;
    err.body = json;
    throw err;
  }

  return json;
}

export default async function handler(req, res) {
  const build_tag = "auth-session-v17-router-admin-invite-edge";
  const debug = process.env.AUTH_DEBUG === "1";

  try {
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }

    const url = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !anonKey) {
      return res.status(500).json({ build_tag, ok: false, error: "Missing SUPABASE_URL / SUPABASE_ANON_KEY" });
    }

    const cookies = parseCookies(req.headers.cookie || "");
    let access_token = cookies.tg_at || "";
    const refresh_token = cookies.tg_rt || "";

    if (!access_token && refresh_token) {
      const r = await refreshAccessToken({ supabaseUrl: url, anonKey, refreshToken: refresh_token });
      access_token = r.access_token;

      const accessMaxAge = Number(r.expires_in || 3600);
      const refreshMaxAge = 30 * 24 * 60 * 60;

      res.setHeader("Set-Cookie", [
        makeCookie("tg_at", r.access_token, { httpOnly: true, secure: true, sameSite: "Lax", path: "/", maxAge: accessMaxAge }),
        makeCookie("tg_rt", r.refresh_token || refresh_token, { httpOnly: true, secure: true, sameSite: "Lax", path: "/", maxAge: refreshMaxAge }),
      ]);
    }

    if (!access_token) {
      return res.status(200).json({ build_tag, ok: true, authenticated: false });
    }

    let sbUser, user;
    {
      const r = await getUserFromAccessToken({ url, anonKey, accessToken: access_token });
      sbUser = r.sbUser;
      user = r.user;

      if (!user && refresh_token) {
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

    if (!user) {
      return res.status(200).json({ build_tag, ok: true, authenticated: false });
    }

    const { data: boot } = await sbUser.rpc("bootstrap_session_context");
    const current_org_id = boot?.[0]?.org_id || null;
    const role = boot?.[0]?.role || null;

    const serviceClient = serviceKey
      ? createClient(url, serviceKey, { auth: { persistSession: false } })
      : null;

    const is_app_root = await computeIsAppRoot({
      userEmail: user.email,
      roleFromBoot: role,
      serviceClient,
    });

    if (req.method === "GET") {
      return res.status(200).json({
        build_tag,
        ok: true,
        authenticated: true,
        bootstrapped: true,
        user: { id: user.id, email: user.email },
        current_org_id,
        role,
        is_app_root,
        organizations: current_org_id ? [{ id: current_org_id }] : [],
      });
    }

    if (req.method === "POST") {
      const body = safeJsonBody(req);
      if (body === null) return res.status(400).json({ build_tag, ok: false, error: "Invalid JSON body" });

      const action = String(body.action || "").trim();

      if (action !== "invite_new_admin") {
        return res.status(400).json({ build_tag, ok: false, error: `Unknown action: ${action || "(missing)"}` });
      }

      if (!is_app_root) {
        return res.status(403).json({ build_tag, ok: false, error: "Forbidden (root only)" });
      }

      const email = normalizeEmail(body.email);
      if (!email) return res.status(400).json({ build_tag, ok: false, error: "Email requerido" });

      // ✅ Llamar Edge Function que sí envía el email y arma org/rol
      const edgeResp = await callEdgeInviteAdmin({
        supabaseUrl: url,
        userAccessToken: access_token,
        payload: {
          email,
          role: "owner",
          org_name: `Org de ${email.split("@")[0]}`,
        },
      });

      return res.status(200).json({
        build_tag,
        ok: true,
        invited_email: email,
        // Pasamos el output de la edge function para depurar (sin tokens)
        edge: edgeResp,
      });
    }

    res.setHeader("Allow", "GET,POST,OPTIONS");
    return res.status(405).json({ build_tag, ok: false, error: "Method not allowed" });
  } catch (e) {
    console.error("[api/auth/session] fatal:", e);
    return res.status(500).json({
      build_tag: "auth-session-v17-router-admin-invite-edge",
      ok: false,
      error: String(e?.message || e),
      ...(process.env.AUTH_DEBUG === "1" ? { debug: { body: e?.body || null, status: e?.status || null } } : {}),
    });
  }
}
