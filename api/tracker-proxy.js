// api/tracker-proxy.js
// Proxy universal para Tracker (PREVIEW/PROD):
// - Evita CORS
// - Forward a Supabase Functions con apikey server-side
// - Authorization: Bearer USER_ACCESS_TOKEN (desde el frontend)
// - Whitelist de funciones
// - Diagnóstico seguro (sin exponer JWT)
// - Guard universal: token.iss debe coincidir con SUPABASE_URL/auth/v1
// - Health-check cuando upstream devuelve 401 (para detectar mismatch SUPABASE_URL vs ANON_KEY)

const BUILD_TAG = "tracker-proxy-v4-healthcheck-20260220";

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
  // no alteramos puntos ni caracteres base64url; solo removemos whitespace
  return t.replace(/\s+/g, "");
}

function isAllowedFn(fnName) {
  return fnName === "send_position" || fnName === "accept-tracker-invite";
}

// fingerprint corto estable sin revelar token
function tokenFingerprint(jwt) {
  try {
    const t = String(jwt || "");
    if (!t.includes(".")) return "no-dots";
    const parts = t.split(".");
    const p2 = parts[1] || "";
    return `len${t.length}:${p2.slice(0, 6)}..${p2.slice(-6)}`;
  } catch {
    return "fp-error";
  }
}

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

function safeHost(url) {
  try {
    const u = new URL(String(url));
    return u.host;
  } catch {
    return "";
  }
}

function anonFingerprint(anonKey) {
  try {
    const a = String(anonKey || "");
    if (!a) return null;
    if (a.length <= 10) return `len${a.length}`;
    return `len${a.length}:${a.slice(0, 4)}..${a.slice(-4)}`;
  } catch {
    return null;
  }
}

// Detecta si el body upstream parece ser el error de gateway
function looksLikeGatewayInvalidJwt(textOrJson) {
  try {
    if (!textOrJson) return false;
    if (typeof textOrJson === "string") return textOrJson.includes("Invalid JWT");
    const msg = textOrJson?.message || textOrJson?.error || "";
    return String(msg).includes("Invalid JWT");
  } catch {
    return false;
  }
}

// Health-check para validar que apikey corresponde al SUPABASE_URL
async function authHealthCheck(supabaseUrl, anonKey) {
  const base = String(supabaseUrl || "").replace(/\/$/, "");
  if (!base || !anonKey) return { ok: false, status: null, error: "missing_url_or_anon" };

  const healthUrl = `${base}/auth/v1/health`;
  try {
    const r = await fetch(healthUrl, {
      method: "GET",
      headers: {
        apikey: String(anonKey),
        // sin Authorization de usuario
      },
    });

    // Supabase suele responder 200 con payload json; si apikey/host no coincide,
    // puede dar 401/403 o incluso fallo de DNS/SSL según el caso.
    let body = null;
    try {
      body = await r.json();
    } catch {
      body = null;
    }

    return {
      ok: r.ok,
      status: r.status,
      body,
    };
  } catch (e) {
    return { ok: false, status: null, error: String(e?.message || e) };
  }
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

    // ✅ Preferir env server-side. Mantengo fallback VITE_* pero reporto source para detectar mismatch en Vercel.
    const supabaseUrl =
      process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;

    const anonKey =
      process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const envSource = {
      url: process.env.SUPABASE_URL ? "SUPABASE_URL" : process.env.VITE_SUPABASE_URL ? "VITE_SUPABASE_URL" : process.env.NEXT_PUBLIC_SUPABASE_URL ? "NEXT_PUBLIC_SUPABASE_URL" : "missing",
      anon: process.env.SUPABASE_ANON_KEY ? "SUPABASE_ANON_KEY" : process.env.VITE_SUPABASE_ANON_KEY ? "VITE_SUPABASE_ANON_KEY" : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "NEXT_PUBLIC_SUPABASE_ANON_KEY" : "missing",
    };

    if (!supabaseUrl || !anonKey) {
      return res.status(500).json({
        ok: false,
        build_tag: BUILD_TAG,
        error: "Server missing SUPABASE env",
        diag: {
          hasUrl: !!supabaseUrl,
          hasAnon: !!anonKey,
          envSource,
        },
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

    const auth = getHeader(req, "authorization");
    const userJwt = normalizeToken(auth);

    if (!userJwt) {
      return res.status(401).json({
        ok: false,
        build_tag: BUILD_TAG,
        error: "Missing Authorization Bearer",
      });
    }

    const payload = decodeJwtPayload(userJwt);
    const nowSec = Math.floor(Date.now() / 1000);
    const exp = payload?.exp ? Number(payload.exp) : null;
    const expInSec = exp && Number.isFinite(exp) ? exp - nowSec : null;

    const expectedIss = String(supabaseUrl).replace(/\/$/, "") + "/auth/v1";
    const gotIss = payload?.iss ? String(payload.iss) : "";

    // ✅ Universal: si issuer no coincide, ese JWT NUNCA va a funcionar contra este Supabase
    if (gotIss && gotIss !== expectedIss) {
      return res.status(401).json({
        ok: false,
        build_tag: BUILD_TAG,
        error: "JWT_ISS_MISMATCH",
        diag: {
          fp: tokenFingerprint(userJwt),
          got_iss: gotIss,
          expected_iss: expectedIss,
          supabase_host: safeHost(supabaseUrl),
          iss_host: safeHost(gotIss),
          sub: payload?.sub ?? null,
          exp_in_sec: expInSec,
          envSource,
        },
      });
    }

    if (expInSec !== null && expInSec <= 0) {
      return res.status(401).json({
        ok: false,
        build_tag: BUILD_TAG,
        error: "JWT_EXPIRED",
        diag: {
          fp: tokenFingerprint(userJwt),
          iss: gotIss || null,
          sub: payload?.sub ?? null,
          exp_in_sec: expInSec,
          supabase_host: safeHost(supabaseUrl),
          envSource,
        },
      });
    }

    const url = String(supabaseUrl).replace(/\/$/, "") + `/functions/v1/${fnName}`;

    const upstream = await fetch(url, {
      method: "POST",
      headers: {
        apikey: String(anonKey),
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

    // ✅ Si es 401, hacemos health-check para detectar mismatch url/anon en Vercel
    let health = null;
    if (upstream.status === 401 && looksLikeGatewayInvalidJwt(json?.message || text)) {
      health = await authHealthCheck(supabaseUrl, anonKey);
    }

    return res.status(upstream.status).json({
      build_tag: BUILD_TAG,
      fn: fnName,
      upstream_status: upstream.status,
      diag: {
        fp: tokenFingerprint(userJwt),
        iss: gotIss || null,
        sub: payload?.sub ?? null,
        exp_in_sec: expInSec,
        supabase_host: safeHost(supabaseUrl),
        anon_fp: anonFingerprint(anonKey), // NO revela el key completo
        envSource,
        auth_health: health, // solo presente en 401 invalid jwt
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