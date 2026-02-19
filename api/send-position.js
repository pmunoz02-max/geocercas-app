// api/send-position.js
// Proxy universal (same-origin) para evitar CORS desde el browser.
// - Lee cookies tg_at / tg_rt
// - Llama a Supabase Edge Function send_position server-side
// - Maneja refresh si 401 invalid jwt
// - No requiere x-api-key desde el frontend

const BUILD_TAG = "send-position-proxy-v1-universal-same-origin-20260219";
const PREVIEW_REF = "mujwsfhkocsuuahlrssn";

function getCookie(req, name) {
  const raw = req?.headers?.cookie || "";
  const parts = raw.split(";").map((s) => s.trim()).filter(Boolean);
  const hit = parts.find((p) => p.startsWith(name + "="));
  if (!hit) return "";
  const value = hit.split("=").slice(1).join("=");
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeToken(maybeToken) {
  let t = String(maybeToken || "").trim();
  if (!t) return "";
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) t = t.slice(1, -1).trim();
  if (t.startsWith("s:")) t = t.slice(2).trim();
  if (/^bearer\s+/i.test(t)) t = t.replace(/^bearer\s+/i, "").trim();
  t = t.replace(/\s+/g, "");
  return t;
}

function makeCookie(
  name,
  value,
  { maxAgeSec, httpOnly = true, secure = true, sameSite = "Lax", path = "/" }
) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${path}`,
    `SameSite=${sameSite}`,
  ];
  if (httpOnly) parts.push("HttpOnly");
  if (secure) parts.push("Secure");
  if (typeof maxAgeSec === "number") parts.push(`Max-Age=${Math.max(0, Math.floor(maxAgeSec))}`);
  return parts.join("; ");
}

function isInvalidJwt401(status, json) {
  if (status !== 401) return false;
  const msg = String(json?.message || "").toLowerCase();
  const err = String(json?.error || "").toLowerCase();
  const det = String(json?.detail || "").toLowerCase();
  return msg.includes("invalid jwt") || err.includes("invalid jwt") || det.includes("invalid jwt");
}

async function refreshAccessToken({ supabaseUrl, anonKey, refreshToken }) {
  const url =
    String(supabaseUrl).replace(/\/$/, "") +
    "/auth/v1/token?grant_type=refresh_token";

  const r = await fetch(url, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }

  if (!r.ok) return { ok: false, status: r.status, body: json };

  const access_token = String(json?.access_token || "");
  const refresh_token = String(json?.refresh_token || "");
  const expires_in = typeof json?.expires_in === "number" ? json.expires_in : null;

  if (!access_token) {
    return { ok: false, status: 500, body: { error: "NO_ACCESS_TOKEN_RETURNED", raw: json } };
  }

  return { ok: true, access_token, refresh_token, expires_in };
}

async function callSendPosition({ supabaseUrl, anonKey, userJwt, body }) {
  const url = String(supabaseUrl).replace(/\/$/, "") + "/functions/v1/send_position";

  const upstream = await fetch(url, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${userJwt}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body || {}),
  });

  const text = await upstream.text();
  let json = null;
  try { json = text ? JSON.parse(text) : { ok: true, raw: text }; }
  catch { json = { raw: text }; }

  return { ok: upstream.ok, status: upstream.status, json };
}

export default async function handler(req, res) {
  try {
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Headers", "content-type, authorization");
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      return res.status(200).send("ok");
    }

    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, build_tag: BUILD_TAG, error: "Method not allowed" });
    }

    const vercelEnv = String(process.env.VERCEL_ENV || "").toLowerCase();
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !anonKey) {
      return res.status(500).json({
        ok: false,
        build_tag: BUILD_TAG,
        error: "Server missing SUPABASE env",
        diag: { vercelEnv, hasSupabaseUrl: !!supabaseUrl, hasAnonKey: !!anonKey },
      });
    }

    // Preview debe apuntar a su proyecto
    if (vercelEnv === "preview" && !String(supabaseUrl).includes(PREVIEW_REF)) {
      return res.status(401).json({
        ok: false,
        build_tag: BUILD_TAG,
        error: "PREVIEW_ENV_MISMATCH",
        diag: { vercelEnv, expected_ref: PREVIEW_REF, supabaseUrl },
      });
    }

    const tgAt = normalizeToken(getCookie(req, "tg_at"));
    const tgRt = normalizeToken(getCookie(req, "tg_rt"));

    if (!tgAt) {
      return res.status(401).json({
        ok: false,
        build_tag: BUILD_TAG,
        error: "Missing tg_at cookie",
        diag: { vercelEnv, has_tg_rt: !!tgRt },
      });
    }

    // 1) intento normal
    let r = await callSendPosition({ supabaseUrl, anonKey, userJwt: tgAt, body: req.body });

    if (r.ok) {
      return res.status(200).json({ build_tag: BUILD_TAG, refreshed: false, ...r.json });
    }

    // 2) refresh si invalid jwt
    if (isInvalidJwt401(r.status, r.json)) {
      if (!tgRt) {
        return res.status(401).json({
          ok: false,
          build_tag: BUILD_TAG,
          error: "UPSTREAM_401_NO_REFRESH_TOKEN",
          upstream_status: r.status,
          upstream: r.json,
        });
      }

      const refreshed = await refreshAccessToken({ supabaseUrl, anonKey, refreshToken: tgRt });
      if (!refreshed.ok) {
        return res.status(401).json({
          ok: false,
          build_tag: BUILD_TAG,
          error: "REFRESH_FAILED",
          refresh_status: refreshed.status,
          refresh_body: refreshed.body,
          upstream_status: r.status,
          upstream: r.json,
        });
      }

      const cookieHeaders = [];
      cookieHeaders.push(makeCookie("tg_at", refreshed.access_token, { maxAgeSec: refreshed.expires_in || 3600 }));
      if (refreshed.refresh_token) cookieHeaders.push(makeCookie("tg_rt", refreshed.refresh_token, { maxAgeSec: 60 * 60 * 24 * 30 }));
      res.setHeader("Set-Cookie", cookieHeaders);

      // retry
      r = await callSendPosition({ supabaseUrl, anonKey, userJwt: refreshed.access_token, body: req.body });

      if (r.ok) {
        return res.status(200).json({ build_tag: BUILD_TAG, refreshed: true, ...r.json });
      }

      return res.status(r.status).json({
        ok: false,
        build_tag: BUILD_TAG,
        error: "UPSTREAM_ERROR_AFTER_REFRESH",
        refreshed: true,
        upstream_status: r.status,
        upstream: r.json,
      });
    }

    return res.status(r.status).json({
      ok: false,
      build_tag: BUILD_TAG,
      error: "UPSTREAM_ERROR",
      upstream_status: r.status,
      upstream: r.json,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, build_tag: BUILD_TAG, error: String(e?.message || e) });
  }
}
