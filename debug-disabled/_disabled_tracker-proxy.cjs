/* api/tracker-proxy.cjs
 * tracker-proxy v10.0 (CJS, Node, no-crash)
 * - GET diagnostic always returns JSON
 * - POST allowlist + raw-body forward
 * - Sends BOTH signature schemes:
 *    A) x-tracker-ts / x-tracker-nonce / x-tracker-sig  => HMAC(secret, `${ts}.${nonce}.${rawBody}`)
 *    B) x-proxy-ts / x-proxy-signature                 => HMAC(secret, `${fn}.${ts}.${rawBody}`)
 */

const crypto = require("crypto");

module.exports.config = { api: { bodyParser: false } };

const BUILD_TAG = "tracker-proxy-v10.0";
const ALLOW_FN = new Set(["accept-tracker-invite", "send_position"]);

function json(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(obj));
}

function getQuery(req) {
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

function randHex(nBytes = 12) {
  return crypto.randomBytes(nBytes).toString("hex");
}

module.exports = async function handler(req, res) {
  try {
    const method = (req.method || "GET").toUpperCase();
    const q = getQuery(req);

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

    const rawBody = await readRawBody(req);

    const SB_URL = process.env.SB_URL;
    const SRK = process.env.SB_SERVICE_ROLE;
    if (!SB_URL || !SRK) {
      return json(res, 500, {
        ok: false,
        error: "missing_env",
        build_tag: BUILD_TAG,
        missing: { SB_URL: !SB_URL, SB_SERVICE_ROLE: !SRK },
      });
    }

    const target = `${SB_URL}/functions/v1/${fn}`;

    // ---------- Outgoing signature headers (DUAL) ----------
    const secret = process.env.TRACKER_PROXY_SECRET || "";

    // Scheme A (tracker_hmac): ts + nonce + sig over `${ts}.${nonce}.${rawBody}`
    const tsA = new Date().toISOString();
    const nonceA = randHex(12);
    const sigA = secret ? hmacHex(secret, `${tsA}.${nonceA}.${rawBody}`) : "";

    // Scheme B (proxy_hmac): ts + sig over `${fn}.${ts}.${rawBody}`
    const tsB = tsA;
    const sigB = secret ? hmacHex(secret, `${fn}.${tsB}.${rawBody}`) : "";

    // Forward headers controlado
    const headers = {
      "Content-Type": req.headers["content-type"] || "application/json",
      Authorization: `Bearer ${SRK}`,
      "x-proxy-build-tag": BUILD_TAG,
    };

    // Enviar ambos esquemas (edge v10 acepta cualquiera)
    if (secret) {
      headers["x-tracker-ts"] = tsA;
      headers["x-tracker-nonce"] = nonceA;
      headers["x-tracker-sig"] = sigA;

      headers["x-proxy-ts"] = tsB;
      headers["x-proxy-signature"] = sigB;
    }

    const resp = await fetch(target, { method: "POST", headers, body: rawBody });

    const text = await resp.text();
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
    return json(res, 500, {
      ok: false,
      error: "proxy_crash",
      build_tag: BUILD_TAG,
      message: e && e.message ? e.message : String(e),
    });
  }
};