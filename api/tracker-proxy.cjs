/* api/tracker-proxy.js
 * tracker-proxy v9.2 (CJS, Node, no-crash)
 * - GET diagnostic always returns JSON
 * - POST allowlist + raw-body forward (HMAC ready)
 */

const crypto = require("crypto");

// Next.js (si aplica): desactiva bodyParser para poder leer raw body
// En Vercel "api/" functions esto simplemente se ignora (no hace daño).
module.exports.config = {
  api: { bodyParser: false },
};

const BUILD_TAG = "tracker-proxy-v9.2";
const ALLOW_FN = new Set(["accept-tracker-invite", "send_position"]);

function json(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(obj));
}

function getQuery(req) {
  // soporta Next (req.query) y Node (req.url)
  if (req.query && typeof req.query === "object") return req.query;
  try {
    const u = new URL(req.url, "http://localhost");
    const q = {};
    u.searchParams.forEach((v, k) => (q[k] = v));
    return q;
  } catch {
    return {};
  }
}

async function readRawBody(req) {
  // Si alguien metió bodyParser, puede existir req.body (objeto). Igual lo convertimos a string estable.
  if (req.body != null) {
    if (Buffer.isBuffer(req.body)) return req.body.toString("utf8");
    if (typeof req.body === "string") return req.body;
    try {
      return JSON.stringify(req.body);
    } catch {
      return String(req.body);
    }
  }

  return await new Promise((resolve, reject) => {
    let data = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function hmacHex(secret, payload) {
  return crypto.createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

function timingSafeEqHex(a, b) {
  try {
    const ab = Buffer.from(String(a || ""), "hex");
    const bb = Buffer.from(String(b || ""), "hex");
    if (ab.length !== bb.length) return false;
    return crypto.timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

module.exports = async function handler(req, res) {
  try {
    const method = (req.method || "GET").toUpperCase();
    const q = getQuery(req);

    // ✅ Diagnóstico que NO debe crashear nunca
    if (method === "GET") {
      return json(res, 200, {
        ok: true,
        build_tag: BUILD_TAG,
        now: new Date().toISOString(),
        env: {
          has_TRACKER_PROXY_SECRET: !!process.env.TRACKER_PROXY_SECRET,
          has_SB_URL: !!process.env.SB_URL,
          has_SB_SERVICE_ROLE: !!process.env.SB_SERVICE_ROLE,
        },
        hint: "POST /api/tracker-proxy?fn=accept-tracker-invite | send_position",
      });
    }

    if (method !== "POST") {
      return json(res, 405, { ok: false, error: "method_not_allowed", build_tag: BUILD_TAG });
    }

    // Solo aceptamos fn=...
    const fn = q.fn || null;
    if (!fn) {
      return json(res, 400, {
        ok: false,
        error: "missing_fn",
        expected: "POST /api/tracker-proxy?fn=accept-tracker-invite|send_position",
        got: q,
        build_tag: BUILD_TAG,
      });
    }
    if (!ALLOW_FN.has(fn)) {
      return json(res, 403, { ok: false, error: "fn_not_allowed", fn, build_tag: BUILD_TAG });
    }

    // Lee RAW body
    const rawBody = await readRawBody(req);

    // (Opcional) Validación HMAC entrante desde el tracker (si ya lo estás enviando)
    // Firma = HMAC(secret, `${ts}.${nonce}.${rawBody}`)
    const secret = process.env.TRACKER_PROXY_SECRET || "";
    const ts = req.headers["x-tracker-ts"] || "";
    const nonce = req.headers["x-tracker-nonce"] || "";
    const sig = req.headers["x-tracker-sig"] || "";

    if (secret && ts && nonce && sig) {
      const payload = `${ts}.${nonce}.${rawBody}`;
      const expected = hmacHex(secret, payload);
      if (!timingSafeEqHex(expected, sig)) {
        return json(res, 401, { ok: false, error: "invalid_signature", build_tag: BUILD_TAG });
      }
    }

    // Forward a Supabase Edge Function via fetch
    const SB_URL = process.env.SB_URL;
    const SRK = process.env.SB_SERVICE_ROLE;

    if (!SB_URL || !SRK) {
      return json(res, 500, {
        ok: false,
        error: "missing_env",
        build_tag: BUILD_TAG,
        missing: {
          SB_URL: !SB_URL,
          SB_SERVICE_ROLE: !SRK,
        },
      });
    }

    // Endpoint de edge functions
    const target = `${SB_URL}/functions/v1/${fn}`;

    // Forward headers controlado
    const headers = {
      "Content-Type": req.headers["content-type"] || "application/json",
      Authorization: `Bearer ${SRK}`,
      "x-proxy-build-tag": BUILD_TAG,
    };

    // Forward HMAC headers (para que la Edge valide el mismo rawBody)
    if (ts) headers["x-tracker-ts"] = String(ts);
    if (nonce) headers["x-tracker-nonce"] = String(nonce);
    if (sig) headers["x-tracker-sig"] = String(sig);

    const resp = await fetch(target, {
      method: "POST",
      headers,
      body: rawBody,
    });

    const text = await resp.text();
    // Siempre devolvemos JSON al cliente (tracker UI)
    // Si la edge devolvió JSON, lo pasamos; si no, lo envolvemos.
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { ok: resp.ok, raw: text };
    }

    return json(res, resp.status, {
      ...data,
      proxied: true,
      fn,
      build_tag: BUILD_TAG,
      edge_status: resp.status,
    });
  } catch (e) {
    // Si algo explota, devolvemos JSON (para no tener 500 silencioso)
    return json(res, 500, {
      ok: false,
      error: "proxy_crash",
      build_tag: BUILD_TAG,
      message: e && e.message ? e.message : String(e),
    });
  }
};