// api/invite-tracker.js
// Proxy universal:
// - fallback de Edge Function names (preview/prod pueden diferir)
// - fallback de AUTH MODE:
//   A) Authorization: Bearer ANON + x-user-jwt: USER_JWT
//   B) Authorization: Bearer USER_JWT (standard Supabase)
// - Refresh tg_rt si upstream devuelve 401 invalid jwt
// - FIX: edgeBody siempre definido

const BUILD_TAG = "invite-proxy-v8-fallback-authmode-20260219";
const PREVIEW_REF = "mujwsfhkocsuuahlrssn";

const DEFAULT_EDGE_FN_CANDIDATES = [
  "invite_tracker",
  "send-tracker-invite-brevo",
  "send-invite-or-magic",
  "invite-user",
];

const SUPPORTED_LANGS = new Set(["es", "en", "fr"]);

function pickLangFromAcceptLanguage(h) {
  const s = String(h || "").toLowerCase();
  if (!s) return "";
  return s.split(",")[0].trim().slice(0, 2);
}

function sanitizeLang(v) {
  const raw = String(v || "").trim().toLowerCase();
  if (!raw) return "es";
  const two = raw.slice(0, 2);
  return SUPPORTED_LANGS.has(two) ? two : "es";
}

function emailCopyFor(lang) {
  if (lang === "en") {
    return {
      subject: "Invitation: GPS Tracker – App Geofences",
      title: "Invitation to GPS Tracker",
      intro1: "You have been invited to use the GPS Tracker for App Geofences.",
      intro2: "This link will open the Tracker in the correct organization.",
      expires: "This link expires in 7 days.",
      cta: "Open GPS Tracker",
      copyLink: "If you can't click, copy and paste this link:",
    };
  }
  if (lang === "fr") {
    return {
      subject: "Invitation : GPS Tracker – App Geocercas",
      title: "Invitation au GPS Tracker",
      intro1: "Vous avez été invité à utiliser le GPS Tracker d’App Geocercas.",
      intro2: "Ce lien ouvrira le Tracker dans la bonne organisation.",
      expires: "Ce lien expire dans 7 jours.",
      cta: "Ouvrir le GPS Tracker",
      copyLink: "Si vous ne pouvez pas cliquer, copiez et collez ce lien :",
    };
  }
  return {
    subject: "Invitación: Tracker GPS – App Geocercas",
    title: "Invitación a Tracker GPS",
    intro1: "Has sido invitado a usar el Tracker GPS de App Geocercas.",
    intro2: "Este enlace abrirá el Tracker en la organización correcta.",
    expires: "Este enlace expira en 7 días.",
    cta: "Abrir Tracker GPS",
    copyLink: "Si no puedes hacer clic, copia y pega este enlace:",
  };
}

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
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) t = t.slice(1, -1).trim();
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

function parseEdgeFnCandidates() {
  const raw =
    process.env.INVITE_TRACKER_EDGE_FNS ||
    process.env.NEXT_PUBLIC_INVITE_TRACKER_EDGE_FNS ||
    "";
  const list = String(raw)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const seen = new Set();
  const out = [];
  for (const x of list) {
    if (!seen.has(x)) {
      seen.add(x);
      out.push(x);
    }
  }
  for (const d of DEFAULT_EDGE_FN_CANDIDATES) {
    if (!seen.has(d)) {
      seen.add(d);
      out.push(d);
    }
  }
  return out;
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
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }

  if (!r.ok) return { ok: false, status: r.status, body: json };

  const access_token = String(json?.access_token || "");
  const refresh_token = String(json?.refresh_token || "");
  const expires_in = typeof json?.expires_in === "number" ? json.expires_in : null;

  if (!access_token) {
    return { ok: false, status: 500, body: { error: "NO_ACCESS_TOKEN_RETURNED", raw: json } };
  }

  return { ok: true, access_token, refresh_token, expires_in };
}

function isFunctionNotFound(upstreamStatus, upstreamJson) {
  if (upstreamStatus !== 404) return false;
  const msg = String(upstreamJson?.message || "").toLowerCase();
  const code = String(upstreamJson?.code || "").toUpperCase();
  return code === "NOT_FOUND" || msg.includes("requested function was not found");
}

function isInvalidJwt401(upstreamStatus, upstreamJson) {
  if (upstreamStatus !== 401) return false;
  const msg = String(upstreamJson?.message || "").toLowerCase();
  const err = String(upstreamJson?.error || "").toLowerCase();
  const det = String(upstreamJson?.detail || "").toLowerCase();
  return msg.includes("invalid jwt") || err.includes("invalid jwt") || det.includes("invalid jwt");
}

// 👉 Señal para cambiar a Modo B
function isMissingSubClaim401(upstreamStatus, upstreamJson) {
  if (upstreamStatus !== 401) return false;
  const det = String(upstreamJson?.detail || "").toLowerCase();
  return det.includes("missing sub claim");
}

// MODE A: Authorization=ANON, x-user-jwt=USER
async function callEdgeModeA({ supabaseUrl, anonKey, userJwt, fnName, body }) {
  const url = String(supabaseUrl).replace(/\/$/, "") + `/functions/v1/${fnName}`;

  const upstream = await fetch(url, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      "x-user-jwt": userJwt,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body || {}),
  });

  const text = await upstream.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  return { status: upstream.status, ok: upstream.ok, json, mode: "A" };
}

// MODE B: Authorization=USER (standard), sin x-user-jwt
async function callEdgeModeB({ supabaseUrl, anonKey, userJwt, fnName, body }) {
  const url = String(supabaseUrl).replace(/\/$/, "") + `/functions/v1/${fnName}`;

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
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  return { status: upstream.status, ok: upstream.ok, json, mode: "B" };
}

export default async function handler(req, res) {
  try {
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Headers", "authorization, x-client-info, apikey, content-type, x-user-jwt");
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
        diag: { vercelEnv, supabaseUrl, hasAnonKey: !!anonKey },
      });
    }

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
        diag: { vercelEnv, has_tg_rt: !!tgRt, supabaseUrl },
      });
    }

    const d1 = tryDecodeJwt(tgAt);
    const p1 = d1.ok ? d1.payload : null;

    const acceptLang = pickLangFromAcceptLanguage(req?.headers?.["accept-language"]);
    const lang = sanitizeLang(req?.body?.lang || acceptLang);

    const edgeBody = {
      ...(req.body || {}),
      lang,
      email_copy: emailCopyFor(lang),
    };

    const candidates = parseEdgeFnCandidates();

    const diagBase = {
      vercelEnv,
      supabaseUrl,
      iss: p1?.iss || null,
      aud: p1?.aud || null,
      exp: p1?.exp || null,
      now: nowUnix(),
      has_tg_rt: !!tgRt,
      build_tag: BUILD_TAG,
      edge_fn_candidates: candidates,
    };

    // ======== Attempt loop ========
    for (const fnName of candidates) {
      // 1) Try Mode A
      let r = await callEdgeModeA({ supabaseUrl, anonKey, userJwt: tgAt, fnName, body: edgeBody });

      // If Mode A fails with "missing sub", try Mode B immediately (same fn)
      if (!r.ok && isMissingSubClaim401(r.status, r.json)) {
        r = await callEdgeModeB({ supabaseUrl, anonKey, userJwt: tgAt, fnName, body: edgeBody });
      }

      if (r.ok) {
        return res.status(200).json({
          build_tag: BUILD_TAG,
          edge_fn: fnName,
          auth_mode: r.mode,
          ...r.json,
        });
      }

      // Not found -> try next fn
      if (isFunctionNotFound(r.status, r.json)) continue;

      // Invalid JWT -> refresh once then retry same fn (B first, then A)
      if (isInvalidJwt401(r.status, r.json)) {
        if (!tgRt) {
          return res.status(401).json({
            ok: false,
            build_tag: BUILD_TAG,
            error: "UPSTREAM_401_NO_REFRESH_TOKEN",
            edge_fn: fnName,
            auth_mode: r.mode,
            upstream: r.json,
            diag: { ...diagBase, edge_fn: fnName, auth_mode: r.mode },
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
            edge_fn: fnName,
            auth_mode: r.mode,
            upstream: r.json,
            diag: { ...diagBase, edge_fn: fnName, auth_mode: r.mode },
          });
        }

        const cookieHeaders = [];
        cookieHeaders.push(makeCookie("tg_at", refreshed.access_token, { maxAgeSec: refreshed.expires_in || 3600 }));
        if (refreshed.refresh_token) cookieHeaders.push(makeCookie("tg_rt", refreshed.refresh_token, { maxAgeSec: 60 * 60 * 24 * 30 }));
        res.setHeader("Set-Cookie", cookieHeaders);

        const d2 = tryDecodeJwt(refreshed.access_token);
        const p2 = d2.ok ? d2.payload : null;
        const diag_refreshed = { iss: p2?.iss || null, aud: p2?.aud || null, exp: p2?.exp || null, now: nowUnix() };

        // Retry Mode B first (most standard)
        let rr = await callEdgeModeB({ supabaseUrl, anonKey, userJwt: refreshed.access_token, fnName, body: edgeBody });

        // If B returns missing-sub (rare), try A
        if (!rr.ok && isMissingSubClaim401(rr.status, rr.json)) {
          rr = await callEdgeModeA({ supabaseUrl, anonKey, userJwt: refreshed.access_token, fnName, body: edgeBody });
        }

        if (rr.ok) {
          return res.status(200).json({
            build_tag: BUILD_TAG,
            edge_fn: fnName,
            auth_mode: rr.mode,
            refreshed: true,
            diag: { ...diagBase, edge_fn: fnName, auth_mode: rr.mode },
            diag_refreshed,
            ...rr.json,
          });
        }

        // Not found after refresh -> continue with next fn
        if (isFunctionNotFound(rr.status, rr.json)) continue;

        return res.status(rr.status).json({
          ok: false,
          build_tag: BUILD_TAG,
          error: "UPSTREAM_ERROR_AFTER_REFRESH",
          edge_fn: fnName,
          auth_mode: rr.mode,
          refreshed: true,
          upstream_status: rr.status,
          upstream: rr.json,
          diag: { ...diagBase, edge_fn: fnName, auth_mode: rr.mode },
          diag_refreshed,
        });
      }

      // Other errors -> stop
      return res.status(r.status).json({
        ok: false,
        build_tag: BUILD_TAG,
        error: "UPSTREAM_ERROR",
        edge_fn: fnName,
        auth_mode: r.mode,
        upstream_status: r.status,
        upstream: r.json,
        diag: { ...diagBase, edge_fn: fnName, auth_mode: r.mode },
      });
    }

    return res.status(404).json({
      ok: false,
      build_tag: BUILD_TAG,
      error: "EDGE_FUNCTION_NOT_FOUND",
      diag: diagBase,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, build_tag: BUILD_TAG, error: String(e?.message || e) });
  }
}
