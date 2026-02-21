/**
 * App Geocercas — Invite Tracker (Preview)
 * Build tag: invite-proxy-v13_diag_minimal_node_fetchonly_20260221
 *
 * Objetivo: eliminar causas típicas de FUNCTION_INVOCATION_FAILED:
 * - Nada de require("undici")
 * - Nada de imports ESM
 * - Nada de dependencias opcionales
 * - Respuesta JSON incluso en error temprano
 */

const BUILD_TAG = "invite-proxy-v13_diag_minimal_node_fetchonly_20260221";

function sendJson(res, status, payload) {
  try {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    // no-cache en preview para que no “pegue” errores viejos
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.end(JSON.stringify(payload));
  } catch (e) {
    // Último recurso: evitar crash silencioso
    try {
      res.statusCode = 500;
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

/**
 * NOTA: Vercel Serverless Functions (api/*.js) normalmente usan CJS:
 * module.exports = (req,res) => {}
 */
module.exports = async (req, res) => {
  // Guard: si por alguna razón algo está raro, responder en JSON.
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
          hasBuffer: typeof Buffer !== "undefined",
        },
        env: {
          // Solo marcamos presence, NO imprimimos secretos
          SUPABASE_URL: safeEnv("SUPABASE_URL"),
          SUPABASE_ANON_KEY: safeEnv("SUPABASE_ANON_KEY"),
          SUPABASE_SERVICE_ROLE_KEY: safeEnv("SUPABASE_SERVICE_ROLE_KEY"),
          PREVIEW_HMAC_SECRET: safeEnv("PREVIEW_HMAC_SECRET"),
        },
        hint:
          "Si GET funciona pero POST falla, el problema está en parsing/logic/upstream. Si GET crashea, es bundling/runtime.",
      });
    }

    if (method !== "POST") {
      return sendJson(res, 405, { ok: false, error: "METHOD_NOT_ALLOWED", build: BUILD_TAG });
    }

    // POST diagnóstico: solo parsea y responde (sin llamar a Supabase todavía)
    const raw = await getRequestBody(req);
    let body = null;

    try {
      body = raw ? JSON.parse(raw) : {};
    } catch (e) {
      return sendJson(res, 400, {
        ok: false,
        error: "INVALID_JSON",
        build: BUILD_TAG,
        details: String(e && e.message ? e.message : e),
      });
    }

    // Validación mínima (para saber qué está llegando desde UI)
    const email = body?.email || body?.tracker_email || null;
    const orgId = body?.org_id || body?.orgId || null;

    return sendJson(res, 200, {
      ok: true,
      build: BUILD_TAG,
      received: {
        keys: Object.keys(body || {}),
        emailPresent: !!email,
        orgIdPresent: !!orgId,
      },
      next:
        "Cuando esto funcione estable, conectamos la llamada real a Supabase/Edge o tu gateway HMAC.",
    });
  } catch (err) {
    return sendJson(res, 500, {
      ok: false,
      error: "UNCAUGHT_EXCEPTION",
      build: BUILD_TAG,
      details: String(err && err.stack ? err.stack : err),
    });
  }
};