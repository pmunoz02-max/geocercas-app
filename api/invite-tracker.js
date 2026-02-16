// api/invite-tracker.js (PREVIEW)
// Proxy robusto: pasa gateway usando ANON as Bearer, y manda JWT real en x-user-jwt
// Mantiene refresh tg_rt, cookies host-only, diag sin filtrar tokens.

const BUILD_TAG = "invite-proxy-v6-anon-bearer-userjwt-20260216";
const PREVIEW_REF = "mujwsfhkocsuuahlrssn";
const EDGE_FN_NAME = "send-tracker-invite-brevo";

function getCookie(req, name) {
  const raw = req?.headers?.cookie || "";
  const parts = raw.split(";").map((s) => s.trim()).filter(Boolean);
  const hit = parts.find((p) => p.startsWith(name + "="));
  if (!hit) return "";
  const value = hit.split("=").slice(1).join("=");
  try { return decodeURIComponent(value); } catch { return value; }
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

function base64UrlDecode(str) {
  let s = String(str || "").replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4 !== 0) s += "=";
  return Buffer.from(s, "base64").toString("utf8");
}

function tryDecodeJwt(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return { ok: false, error: "JWT_NOT_3_PARTS" };
  try {
    const payload = JSON.parse(base64UrlDecode(parts[1]));
    return { ok: true, payload };
  } catch (e) {
    return { ok: false, error: "JWT_DECODE_FAILED", details: String(e?.message || e) };
  }
}

function nowUnix() {
  return Math.floor(Date.now() / 1000);
}

function makeCookie(name, value, { maxAgeSec, httpOnly = true, secure = true, sameSite = "Lax", path = "/" }) {
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
  if (!access_token) return { ok: false, status: 500, body: { error: "NO_ACCESS_TOKEN_RETURNED", raw: json } };

  return { ok: true, access_token, refresh_token, expires_in };
}

async function callEdge({ supabaseUrl, anonKey, userJwt, body }) {
  const url = String(supabaseUrl).replace(/\/$/, "") + `/functions/v1/${EDGE_FN_NAME}`;

  const upstream = await fetch(url, {
    method: "POST",
    headers: {
      apikey: anonKey,
      // ✅ Gatekeeper token: always acceptable
      Authorization: `Bearer ${anonKey}`,
      // ✅ Real user token goes here
      "x-user-jwt": userJwt,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body || {}),
  });

  const text = await upstream.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  return { status: upstream.status, ok: upstream.ok, json };
}

export default async function handler(req, res) {
  try {
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Headers", "authorization, x-client-info, apikey, content-type, x-user-jwt");
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      return res.status(200).send("ok");
    }

    if (req.method !== "POST") return res.status(405).json({ ok: false, build_tag: BUILD_TAG, error: "Method not allowed" });

    const vercelEnv = String(process.env.VERCEL_ENV || "").toLowerCase();
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !anonKey) {
      return res.status(500).json({ ok: false, build_tag: BUILD_TAG, error: "Server missing SUPABASE env", diag: { vercelEnv, supabaseUrl, hasAnonKey: !!anonKey } });
    }

    if (vercelEnv === "preview" && !String(supabaseUrl).includes(PREVIEW_REF)) {
      return res.status(401).json({ ok: false, build_tag: BUILD_TAG, error: "PREVIEW_ENV_MISMATCH", diag: { vercelEnv, expected_ref: PREVIEW_REF, supabaseUrl } });
    }

    const tgAt = normalizeToken(getCookie(req, "tg_at"));
    const tgRt = normalizeToken(getCookie(req, "tg_rt"));

    if (!tgAt) {
      return res.status(401).json({ ok: false, build_tag: BUILD_TAG, error: "Missing tg_at cookie", diag: { vercelEnv, has_tg_rt: !!tgRt, supabaseUrl, edge_fn: EDGE_FN_NAME } });
    }

    const d1 = tryDecodeJwt(tgAt);
    const p1 = d1.ok ? d1.payload : null;

    const diag = {
      vercelEnv,
      supabaseUrl,
      edge_fn: EDGE_FN_NAME,
      iss: p1?.iss || null,
      aud: p1?.aud || null,
      exp: p1?.exp || null,
      now: nowUnix(),
      has_tg_rt: !!tgRt,
      build_tag: BUILD_TAG,
    };

    const first = await callEdge({ supabaseUrl, anonKey, userJwt: tgAt, body: req.body || {} });
    if (first.ok) return res.status(200).json({ build_tag: BUILD_TAG, ...first.json });

    const first401 =
      first.status === 401 &&
      (String(first.json?.message || "").toLowerCase().includes("invalid jwt") ||
        String(first.json?.error || "").toLowerCase().includes("invalid jwt") ||
        first.json?.code === 401);

    if (first401) {
      if (!tgRt) return res.status(401).json({ ok: false, build_tag: BUILD_TAG, error: "UPSTREAM_401_NO_REFRESH_TOKEN", upstream: first.json, diag });

      const refreshed = await refreshAccessToken({ supabaseUrl, anonKey, refreshToken: tgRt });
      if (!refreshed.ok) return res.status(401).json({ ok: false, build_tag: BUILD_TAG, error: "REFRESH_FAILED", refresh_status: refreshed.status, refresh_body: refreshed.body, upstream: first.json, diag });

      const cookieHeaders = [];
      cookieHeaders.push(makeCookie("tg_at", refreshed.access_token, { maxAgeSec: refreshed.expires_in || 3600 }));
      if (refreshed.refresh_token) cookieHeaders.push(makeCookie("tg_rt", refreshed.refresh_token, { maxAgeSec: 60 * 60 * 24 * 30 }));
      res.setHeader("Set-Cookie", cookieHeaders);

      const d2 = tryDecodeJwt(refreshed.access_token);
      const p2 = d2.ok ? d2.payload : null;

      const diag_refreshed = { iss: p2?.iss || null, aud: p2?.aud || null, exp: p2?.exp || null, now: nowUnix() };

      const second = await callEdge({ supabaseUrl, anonKey, userJwt: refreshed.access_token, body: req.body || {} });
      if (second.ok) return res.status(200).json({ build_tag: BUILD_TAG, refreshed: true, diag, diag_refreshed, ...second.json });

      return res.status(second.status).json({ ok: false, build_tag: BUILD_TAG, error: "UPSTREAM_ERROR_AFTER_REFRESH", refreshed: true, upstream: second.json, diag, diag_refreshed });
    }

    return res.status(first.status).json({ ok: false, build_tag: BUILD_TAG, error: "UPSTREAM_ERROR", upstream_status: first.status, upstream: first.json, diag });
  } catch (e) {
    return res.status(500).json({ ok: false, build_tag: BUILD_TAG, error: String(e?.message || e) });
  }
}
