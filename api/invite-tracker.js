/**
 * App Geocercas — Invite Tracker (Preview)
 * Build tag: invite-proxy-v14_esm_fix_require_20260221
 *
 * FIX: correr en entorno ESM (require no existe)
 * - Sin require()
 * - Sin module.exports
 * - Export default handler(req,res)
 */

const BUILD_TAG = "invite-proxy-v14_esm_fix_require_20260221";

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

function safeEnv(name) {
  return process.env[name] ? "[set]" : "[missing]";
}

export default async function handler(req, res) {
  try {
    const method = (req.method || "GET").toUpperCase();

    // Ping diagnóstico
    if (method === "GET") {
      return sendJson(res, 200, {
        ok: true,
        build: BUILD_TAG,
        runtime: {
          node: process.version,
          platform: process.platform,
          arch: process.arch,
          hasFetch: typeof fetch === "function",
          hasBuffer: typeof Buffer !== "undefined"
        },
        env: {
          SUPABASE_URL: safeEnv("SUPABASE_URL"),
          SUPABASE_ANON_KEY: safeEnv("SUPABASE_ANON_KEY"),
          SUPABASE_SERVICE_ROLE_KEY: safeEnv("SUPABASE_SERVICE_ROLE_KEY"),
          PREVIEW_HMAC_SECRET: safeEnv("PREVIEW_HMAC_SECRET")
        }
      });
    }

    if (method !== "POST") {
      return sendJson(res, 405, {
        ok: false,
        error: "METHOD_NOT_ALLOWED",
        build: BUILD_TAG
      });
    }

    // POST diagnóstico (sin upstream)
    const raw = await getRequestBody(req);
    let body = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch (e) {
      return sendJson(res, 400, {
        ok: false,
        error: "INVALID_JSON",
        build: BUILD_TAG,
        details: String(e?.message || e)
      });
    }

    const email = body?.email || body?.tracker_email || null;
    const orgId = body?.org_id || body?.orgId || null;

    return sendJson(res, 200, {
      ok: true,
      build: BUILD_TAG,
      received: {
        keys: Object.keys(body || {}),
        emailPresent: !!email,
        orgIdPresent: !!orgId
      },
      next:
        "Si esto ya funciona, reintroducimos la lógica real de invite (por capas) sin JWT hacia Supabase Functions."
    });
  } catch (err) {
    return sendJson(res, 500, {
      ok: false,
      error: "UNCAUGHT_EXCEPTION",
      build: BUILD_TAG,
      details: String(err?.stack || err)
    });
  }
}