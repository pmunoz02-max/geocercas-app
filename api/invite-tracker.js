/**
 * App Geocercas — Invite Tracker (Preview)
 * Build tag: invite-proxy-v13_1_cosmetic-bump_20260221
 *
 * Cambio cosmético:
 * - BUILD_TAG nuevo
 * - Header "X-Build-Tag" en las respuestas
 */

const BUILD_TAG = "invite-proxy-v13_1_cosmetic-bump_20260221";

function sendJson(res, status, payload) {
  try {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.setHeader("X-Build-Tag", BUILD_TAG); // cosmético para ver qué versión corre
    res.end(JSON.stringify(payload));
  } catch (e) {
    try {
      res.statusCode = 500;
      res.setHeader("X-Build-Tag", BUILD_TAG);
      res.end('{"ok":false,"error":"UNHANDLED_RESPONSE_FAILURE"}');
    } catch (_) {}
  }
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
  const v = process.env[name];
  return v ? "[set]" : "[missing]";
}

module.exports = async (req, res) => {
  try {
    const method = (req.method || "GET").toUpperCase();

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
      return sendJson(res, 405, { ok: false, error: "METHOD_NOT_ALLOWED", build: BUILD_TAG });
    }

    const raw = await getRequestBody(req);
    let body = null;

    try {
      body = raw ? JSON.parse(raw) : {};
    } catch (e) {
      return sendJson(res, 400, {
        ok: false,
        error: "INVALID_JSON",
        build: BUILD_TAG,
        details: String(e && e.message ? e.message : e)
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
      }
    });
  } catch (err) {
    return sendJson(res, 500, {
      ok: false,
      error: "UNCAUGHT_EXCEPTION",
      build: BUILD_TAG,
      details: String(err && err.stack ? err.stack : err)
    });
  }
};