/**
 * App Geocercas — Vercel API: /api/invite-tracker (Preview)
 * Build tag: invite-proxy-v15_3_timeout_diag_edge_ping_20260221
 *
 * - ESM puro
 * - caller_jwt puede venir:
 *    A) desde el cliente (body.caller_jwt) ✅ recomendado
 *    B) fallback: /api/auth/session (solo si ese endpoint expone access_token)
 * - Firma HMAC (x-edge-ts, x-edge-sig)
 * - Llama a Supabase Edge Function invite_tracker SIN Authorization
 * - Diagnóstico fuerte: timeouts, dns/network, y muestra parcial del body de error
 */

import crypto from "node:crypto";

const BUILD_TAG = "invite-proxy-v15_3_timeout_diag_edge_ping_20260221";

// ⏱️ tiempo realista para Edge + DB + Brevo
const EDGE_TIMEOUT_MS = 45000;
const AUTH_SESSION_TIMEOUT_MS = 12000;

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("X-Build-Tag", BUILD_TAG);
  res.end(JSON.stringify(payload));
}

function getRequestBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function normEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function hmacSha256Hex(secret, message) {
  return crypto.createHmac("sha256", secret).update(message, "utf8").digest("hex");
}

function safeEnv(name) {
  return process.env[name] ? "[set]" : "[missing]";
}

function redact(v) {
  const s = String(v || "");
  if (!s) return "";
  if (s.length <= 10) return "***";
  return `${s.slice(0, 4)}***${s.slice(-4)}`;
}

async function fetchWithTimeout(url, init, timeoutMs = 15000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const resp = await fetch(url, { ...init, signal: controller.signal });
    return { resp, ms: Date.now() - started };
  } finally {
    clearTimeout(t);
  }
}

// Fallback opcional (solo sirve si /api/auth/session expone access_token)
async function getCallerJwtFromSession(req) {
  const cookie = req.headers?.cookie || req.headers?.Cookie || "";
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;

  if (!host) return { ok: false, error: "Missing host header for auth/session" };

  const url = `${proto}://${host}/api/auth/session`;

  const { resp: r, ms } = await fetchWithTimeout(
    url,
    {
      method: "GET",
      headers: { cookie, accept: "application/json" },
    },
    AUTH_SESSION_TIMEOUT_MS
  );

  const text = await r.text().catch(() => "");
  if (!r.ok) {
    return { ok: false, error: `auth/session failed ${r.status}`, detail: text.slice(0, 400), ms };
  }

  let j = {};
  try {
    j = text ? JSON.parse(text) : {};
  } catch {
    return { ok: false, error: "auth/session returned non-JSON", detail: text.slice(0, 400), ms };
  }

  const token =
    j?.session?.access_token ||
    j?.access_token ||
    j?.data?.session?.access_token ||
    null;

  if (!token) {
    return {
      ok: false,
      error: "No access_token in auth/session response",
      detail: JSON.stringify(j).slice(0, 500),
      ms,
    };
  }

  return { ok: true, token, ms };
}

export default async function handler(req, res) {
  const method = (req.method || "GET").toUpperCase();

  const SUPABASE_FUNCTIONS_URL = String(process.env.SUPABASE_FUNCTIONS_URL || "").replace(/\/$/, "");
  const INVITE_HMAC_SECRET = String(process.env.INVITE_HMAC_SECRET || "");

  // URL de la function
  const edgeUrl = SUPABASE_FUNCTIONS_URL
    ? `${SUPABASE_FUNCTIONS_URL}/functions/v1/invite_tracker`
    : "";

  try {
    if (method === "GET") {
      // ✅ Ping + edge ping (sin HMAC) solo para saber si responde algo
      let edgePing = null;
      if (edgeUrl) {
        try {
          const { resp, ms } = await fetchWithTimeout(
            edgeUrl,
            { method: "GET", headers: { accept: "application/json" } },
            8000
          );
          const txt = await resp.text().catch(() => "");
          edgePing = {
            ok: resp.ok,
            status: resp.status,
            ms,
            sample: txt.slice(0, 200),
          };
        } catch (e) {
          edgePing = { ok: false, error: String(e?.name || "ERR"), detail: String(e?.message || e) };
        }
      }

      return sendJson(res, 200, {
        ok: true,
        build: BUILD_TAG,
        accepts_caller_jwt: true,
        runtime: { node: process.version, platform: process.platform },
        env: {
          SUPABASE_FUNCTIONS_URL: safeEnv("SUPABASE_FUNCTIONS_URL"),
          INVITE_HMAC_SECRET: safeEnv("INVITE_HMAC_SECRET"),
        },
        edge: {
          url: edgeUrl ? edgeUrl.replace(INVITE_HMAC_SECRET, "[redacted]") : "",
          ping: edgePing,
        },
      });
    }

    if (method !== "POST") {
      return sendJson(res, 405, { ok: false, error: "METHOD_NOT_ALLOWED", build: BUILD_TAG });
    }

    if (!SUPABASE_FUNCTIONS_URL) {
      return sendJson(res, 500, { ok: false, error: "Missing SUPABASE_FUNCTIONS_URL", build: BUILD_TAG });
    }
    if (!INVITE_HMAC_SECRET) {
      return sendJson(res, 500, { ok: false, error: "Missing INVITE_HMAC_SECRET", build: BUILD_TAG });
    }

    const raw = await getRequestBody(req);
    let body = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch (e) {
      return sendJson(res, 400, { ok: false, error: "INVALID_JSON", build: BUILD_TAG, detail: String(e?.message || e) });
    }

    const org_id = String(body?.org_id || "").trim();
    const emailNorm = normEmail(body?.email || "");
    const name = String(body?.name || body?.to_name || body?.toName || "").trim() || "";

    if (!org_id) return sendJson(res, 400, { ok: false, error: "Missing org_id", build: BUILD_TAG });
    if (!emailNorm || !emailNorm.includes("@")) {
      return sendJson(res, 400, { ok: false, error: "Invalid email", build: BUILD_TAG });
    }

    // ✅ MODO A: si viene caller_jwt desde el cliente, úsalo
    let caller_jwt = String(body?.caller_jwt || "").trim();
    let jwt_source = caller_jwt ? "client" : "auth/session";

    if (!caller_jwt) {
      const s = await getCallerJwtFromSession(req);
      if (!s.ok) {
        return sendJson(res, 401, {
          ok: false,
          error: "NO_SESSION",
          build: BUILD_TAG,
          detail: s.error,
          more: s.detail,
          jwt_source,
          got_caller_jwt_in_body: false,
          auth_session_ms: s.ms,
        });
      }
      caller_jwt = s.token;
    }

    const ts = Date.now().toString();
    const msg = `${ts}\n${org_id}\n${emailNorm}`;
    const sig = hmacSha256Hex(INVITE_HMAC_SECRET, msg);

    // ✅ llamada a edge con timeout largo
    let edgeTimingMs = null;
    let edgeText = "";
    let edgeStatus = 0;

    try {
      const { resp: edgeResp, ms } = await fetchWithTimeout(
        edgeUrl,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-edge-ts": ts,
            "x-edge-sig": sig,
          },
          body: JSON.stringify({ org_id, email: emailNorm, name, caller_jwt }),
        },
        EDGE_TIMEOUT_MS
      );

      edgeTimingMs = ms;
      edgeStatus = edgeResp.status;
      edgeText = await edgeResp.text().catch(() => "");

      let edgeJson = null;
      let edgeParseError = null;
      try {
        edgeJson = edgeText ? JSON.parse(edgeText) : null;
      } catch (e) {
        edgeParseError = String(e?.message || e);
        edgeJson = null;
      }

      const edgeBuildTag =
        (edgeJson && (edgeJson.build_tag || edgeJson.build || edgeJson.BUILD_TAG)) || null;

      const edgeRawSample = !edgeJson ? edgeText.slice(0, 500) : undefined;

      return sendJson(res, edgeStatus || 200, {
        ...(edgeJson || {}),
        _proxy: {
          ok: edgeResp.ok,
          build: BUILD_TAG,
          jwt_source,
          got_caller_jwt_in_body: Boolean(String(body?.caller_jwt || "").trim()),
          edge_status: edgeStatus,
          edge_ms: edgeTimingMs,
          edge_build_tag: edgeBuildTag,
          edge_parse_error: edgeParseError,
          edge_raw_sample: edgeRawSample,
        },
      });
    } catch (e) {
      // ✅ caso AbortError u otro error de red
      return sendJson(res, 504, {
        ok: false,
        error: "EDGE_FETCH_FAILED",
        build: BUILD_TAG,
        detail: String(e?.name || "ERR"),
        message: String(e?.message || e),
        diag: {
          edge_url: edgeUrl,
          edge_timeout_ms: EDGE_TIMEOUT_MS,
          jwt_source,
          got_caller_jwt_in_body: Boolean(String(body?.caller_jwt || "").trim()),
          ts,
          sig: redact(sig),
        },
      });
    }
  } catch (err) {
    return sendJson(res, 500, {
      ok: false,
      error: "UNCAUGHT_EXCEPTION",
      build: BUILD_TAG,
      detail: String(err?.stack || err),
      diag: {
        edge_url: edgeUrl,
        env: {
          SUPABASE_FUNCTIONS_URL: safeEnv("SUPABASE_FUNCTIONS_URL"),
          INVITE_HMAC_SECRET: safeEnv("INVITE_HMAC_SECRET"),
        },
      },
    });
  }
}