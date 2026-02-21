// api/tracker-proxy.js
// Proxy universal para Tracker (PREVIEW/PROD):
// - Evita CORS (browser -> same-origin /api)
// - Forward a Supabase Functions con apikey server-side
// - Authorization: Bearer USER_ACCESS_TOKEN (desde el frontend)
// - Soporta múltiples funciones via ?fn=send_position | accept-tracker-invite
//
// POST /api/tracker-proxy?fn=send_position
// POST /api/tracker-proxy?fn=accept-tracker-invite

const BUILD_TAG = "tracker-proxy-v2-forward-auth-robust-20260220";

function toStr(v) {
  return String(v ?? "");
}

function getHeader(req, name) {
  const h = req?.headers || {};
  const key = String(name || "").toLowerCase();
  const v = h[name] ?? h[key];
  if (Array.isArray(v)) return v[0] || "";
  return String(v || "");
}

function normalizeToken(maybeToken) {
  let t = String(maybeToken || "").trim();
  if (!t) return "";
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) t = t.slice(1, -1).trim();
  if (/^bearer\s+/i.test(t)) t = t.replace(/^bearer\s+/i, "").trim();
  return t.replace(/\s+/g, "");
}

function isAllowedFn(fnName) {
  // ✅ whitelist (seguro y universal)
  return fnName === "send_position" || fnName === "accept-tracker-invite";
}

// No exponer token; solo fingerprint determinístico corto
function tokenFingerprint(jwt) {
  try {
    const t = String(jwt || "");
    if (!t.includes(".")) return "no-dots";
    const parts = t.split(".");
    const p2 = parts[1] || "";
    // fingerprint corto estable: len + first/last chars
    return `len${t.length}:${p2.slice(0, 6)}..${p2.slice(-6)}`;
  } catch {
    return "fp-error";
  }
}

// Decodifica payload sin verificar firma (solo diagnóstico)
function decodeJwtPayload(jwt) {
  try {
    const t = String(jwt || "");
    const parts = t.split(".");
    if (parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
    const json = Buffer.from(b64 + pad, "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  try {
    // CORS (same-origin normally; harmless)
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Headers", "content-type, authorization");
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      return res.status(200).send("ok");
    }

    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, build_tag: BUILD_TAG, error: "Method not allowed" });
    }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !anonKey) {
      return res.status(500).json({
        ok: false,
        build_tag: BUILD_TAG,
        error: "Server missing SUPABASE env",
        diag: { hasUrl: !!supabaseUrl, hasAnon: !!anonKey },
      });
    }

    const fnName = toStr(req.query?.fn || "").trim();
    if (!isAllowedFn(fnName)) {
      return res.status(400).json({
        ok: false,
        build_tag: BUILD_TAG,
        error: "FN_NOT_ALLOWED",
        got: fnName,
        allowed: ["send_position", "accept-tracker-invite"],
      });
    }

    // ✅ Token del usuario viene desde el frontend (Supabase session access_token)
    const auth = getHeader(req, "authorization");
    const userJwt = normalizeToken(auth);

    if (!userJwt) {
      return res.status(401).json({
        ok: false,
        build_tag: BUILD_TAG,
        error: "Missing Authorization Bearer",
      });
    }

    // Diagnóstico: exp/iss/sub sin exponer el token
    const payload = decodeJwtPayload(userJwt);
    const nowSec = Math.floor(Date.now() / 1000);
    const exp = payload?.exp ? Number(payload.exp) : null;
    const expInSec = exp && Number.isFinite(exp) ? exp - nowSec : null;

    // Si el token está expirado, devolvemos 401 claro (esto evita “Invalid JWT” opaco)
    if (expInSec !== null && expInSec <= 0) {
      return res.status(401).json({
        ok: false,
        build_tag: BUILD_TAG,
        error: "JWT_EXPIRED",
        diag: {
          fp: tokenFingerprint(userJwt),
          iss: payload?.iss ?? null,
          sub: payload?.sub ?? null,
          exp_in_sec: expInSec,
        },
      });
    }

    const url = String(supabaseUrl).replace(/\/$/, "") + `/functions/v1/${fnName}`;

    const upstream = await fetch(url, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${userJwt}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(req.body || {}),
    });

    const text = await upstream.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text };
    }

    return res.status(upstream.status).json({
      build_tag: BUILD_TAG,
      fn: fnName,
      upstream_status: upstream.status,
      // diag no sensible (no token)
      diag: {
        fp: tokenFingerprint(userJwt),
        iss: payload?.iss ?? null,
        sub: payload?.sub ?? null,
        exp_in_sec: expInSec,
      },
      ...json,
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      build_tag: BUILD_TAG,
      error: String(e?.message || e),
    });
  }
}