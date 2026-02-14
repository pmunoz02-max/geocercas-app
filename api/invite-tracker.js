// api/invite-tracker.js
// Preview-only safe proxy for calling Supabase Edge Function invite_tracker
// - Reads HttpOnly cookies tg_at + tg_rt
// - If upstream returns 401 Invalid JWT, refreshes access_token using tg_rt server-side
// - Updates tg_at cookie (host-only) and retries once
// - Adds build_tag + diagnostics (no token leakage)

const BUILD_TAG = "invite-proxy-v3-refresh-20260214";
const PREVIEW_REF = "mujwsfhkocsuuahlrssn";

function getCookie(req, name) {
  const raw = req?.headers?.cookie || "";
  const parts = raw
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);

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

  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    t = t.slice(1, -1).trim();
  }
  if (t.startsWith("s:")) t = t.slice(2).trim();
  if (/^bearer\s+/i.test(t)) t = t.replace(/^bearer\s+/i, "").trim();
  t = t.replace(/\s+/g, "");
  return t;
}

function base64UrlDecode(str) {
  let s = String(str || "").replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4 !== 0) s += "=";
  return Buffer.from(s, "base64").toString("utf8");
}

function tryDecodeJwt(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return { ok: false, error: "JWT_NOT_3_PARTS" };
  try {
    const header = JSON.parse(base64UrlDecode(parts[0]));
    const payload = JSON.parse(base64UrlDecode(parts[1]));
    return { ok: true, header, payload };
  } catch (e) {
    return { ok: false, error: "JWT_DECODE_FAILED", details: String(e?.message || e) };
  }
}

function nowUnix() {
  return Math.floor(Date.now() / 1000);
}

function makeCookie(name, value, { maxAgeSec, httpOnly = true, secure = true, sameSite = "Lax", path = "/" }) {
  // Host-only cookie: DO NOT set Domain= (prevents preview/prod mixing)
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${path}`, `SameSite=${sameSite}`];
  if (httpOnly) parts.push("HttpOnly");
  if (secure) parts.push("Secure");
  if (typeof maxAgeSec === "number") parts.push(`Max-Age=${Math.max(0, Math.floor(maxAgeSec))}`);
  return parts.join("; ");
}

async function refreshAccessToken({ supabaseUrl, anonKey, refreshToken }) {
  const url = String(supabaseUrl).replace(/\/$/, "") + "/auth/v1/token?grant_type=refresh_token";

  const r = await fetch(url, {
    method: "POST",
    headers: {
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  const text = await r.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }

  if (!r.ok) {
    return { ok: false, status: r.status, body: json };
  }

  const access_token = json?.access_token || "";
  const refresh_token = json?.refresh_token || ""; // may rotate
  const expires_in = typeof json?.expires_in === "number" ? json.expires_in : null;

  if (!access_token) {
    return { ok: false, status: 500, body: { error: "NO_ACCESS_TOKEN_RETURNED", raw: json } };
  }

  return { ok: true, access_token, refresh_token, expires_in, raw: json };
}

async function callInviteEdge({ supabaseUrl, anonKey, accessToken, body }) {
  const url = String(supabaseUrl).replace(/\/$/, "") + "/functions/v1/invite_tracker";

  const upstream = await fetch(url, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body || {}),
  });

  const text = await upstream.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }

  return { status: upstream.status, ok: upstream.ok, json };
}

export default async function handler(req, res) {
  try {
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "authorization, x-client-info, apikey, content-type"
      );
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
        error: "Server missing SUPABASE env (URL/ANON)",
        diag: { vercelEnv, hasSupabaseUrl: !!supabaseUrl, hasAnonKey: !!anonKey, supabaseUrl },
      });
    }

    // Preview guardrail: ensure env points to preview project
    if (vercelEnv === "preview") {
      const urlHasRef = String(supabaseUrl).includes(PREVIEW_REF);
      if (!urlHasRef) {
        return res.status(401).json({
          ok: false,
          build_tag: BUILD_TAG,
          error: "PREVIEW_ENV_MISMATCH",
          diag: { vercelEnv, expected_ref: PREVIEW_REF, supabaseUrl },
        });
      }
    }

    const tgAt = normalizeToken(getCookie(req, "tg_at"));
    const tgRt = normalizeToken(getCookie(req, "tg_rt"));

    if (!tgAt) {
      return res.status(401).json({
        ok: false,
        build_tag: BUILD_TAG,
        error: "Missing tg_at cookie",
        diag: { vercelEnv, has_tg_rt: !!tgRt, supabaseUrl },
      });
    }

    // Decode for diag only (no token leakage)
    const decoded = tryDecodeJwt(tgAt);
    const payload = decoded.ok ? decoded.payload : null;
    const diag = {
      vercelEnv,
      supabaseUrl,
      iss: payload?.iss || null,
      aud: payload?.aud || null,
      exp: payload?.exp || null,
      now: nowUnix(),
      has_tg_rt: !!tgRt,
      build_tag: BUILD_TAG,
    };

    // 1) First call with current tg_at
    const first = await callInviteEdge({
      supabaseUrl,
      anonKey,
      accessToken: tgAt,
      body: req.body || {},
    });

    if (first.ok) {
      return res.status(200).json({ build_tag: BUILD_TAG, ...first.json });
    }

    // 2) If 401 Invalid JWT -> attempt refresh using tg_rt, then retry once
    const first401 =
      first.status === 401 &&
      (String(first.json?.message || "").toLowerCase().includes("invalid jwt") ||
        String(first.json?.error || "").toLowerCase().includes("invalid jwt") ||
        first.json?.code === 401);

    if (first401) {
      if (!tgRt) {
        return res.status(401).json({
          ok: false,
          build_tag: BUILD_TAG,
          error: "UPSTREAM_401_NO_REFRESH_TOKEN",
          upstream: first.json,
          diag,
        });
      }

      const refreshed = await refreshAccessToken({
        supabaseUrl,
        anonKey,
        refreshToken: tgRt,
      });

      if (!refreshed.ok) {
        return res.status(401).json({
          ok: false,
          build_tag: BUILD_TAG,
          error: "REFRESH_FAILED",
          refresh_status: refreshed.status,
          refresh_body: refreshed.body,
          upstream: first.json,
          diag,
        });
      }

      // Set new cookies (host-only). Keep secure/httpOnly.
      // access_token TTL is expires_in seconds if present
      const cookieHeaders = [];
      if (refreshed.expires_in) {
        cookieHeaders.push(
          makeCookie("tg_at", refreshed.access_token, { maxAgeSec: refreshed.expires_in })
        );
      } else {
        // fallback: 1 hour
        cookieHeaders.push(makeCookie("tg_at", refreshed.access_token, { maxAgeSec: 3600 }));
      }

      // refresh_token may rotate
      if (refreshed.refresh_token) {
        // Supabase refresh tokens are long-lived; we set 30 days as a safe max-age.
        // If you manage exact TTL elsewhere, adjust later.
        cookieHeaders.push(makeCookie("tg_rt", refreshed.refresh_token, { maxAgeSec: 60 * 60 * 24 * 30 }));
      }

      res.setHeader("Set-Cookie", cookieHeaders);

      // Retry edge function with new access token
      const second = await callInviteEdge({
        supabaseUrl,
        anonKey,
        accessToken: refreshed.access_token,
        body: req.body || {},
      });

      if (second.ok) {
        return res.status(200).json({
          build_tag: BUILD_TAG,
          refreshed: true,
          ...second.json,
        });
      }

      return res.status(second.status).json({
        ok: false,
        build_tag: BUILD_TAG,
        error: "UPSTREAM_ERROR_AFTER_REFRESH",
        refreshed: true,
        upstream: second.json,
        diag,
      });
    }

    // Other upstream errors (pass through)
    return res.status(first.status).json({
      ok: false,
      build_tag: BUILD_TAG,
      error: "UPSTREAM_ERROR",
      upstream_status: first.status,
      upstream: first.json,
      diag,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, build_tag: BUILD_TAG, error: String(e?.message || e) });
  }
}
