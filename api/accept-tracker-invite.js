import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const BUILD_TAG = "accept-tracker-invite-proxy-v1_preview_20260305";

function json(res, status, payload) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  res.send(JSON.stringify(payload));
}

function getSupabaseFunctionsBaseUrl() {
  const explicit = String(process.env.SUPABASE_FUNCTIONS_URL || "").trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const sbUrl = String(process.env.SUPABASE_URL || "").trim();
  if (!sbUrl) return "";

  try {
    const u = new URL(sbUrl);
    const host = u.hostname;
    if (host.endsWith(".supabase.co")) {
      const projectRef = host.replace(".supabase.co", "");
      return `https://${projectRef}.functions.supabase.co`;
    }
  } catch {}

  return "";
}

function getBearerToken(req) {
  const h = String(req.headers.authorization || "").trim();
  if (!/^bearer\s+/i.test(h)) return "";
  return h.replace(/^bearer\s+/i, "").trim();
}

function isUuid(v) {
  const s = String(v ?? "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

function hmacHex(secret, msg) {
  return crypto.createHmac("sha256", secret).update(msg).digest("hex");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, {
      ok: false,
      build_tag: BUILD_TAG,
      error: "METHOD_NOT_ALLOWED",
    });
  }

  try {
    const SUPABASE_URL = String(process.env.SUPABASE_URL || "").trim();
    const SUPABASE_ANON_KEY = String(process.env.SUPABASE_ANON_KEY || "").trim();
    const SUPABASE_FUNCTIONS_BASE = getSupabaseFunctionsBaseUrl();
    const TRACKER_PROXY_SECRET = String(process.env.TRACKER_PROXY_SECRET || "").trim();

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_FUNCTIONS_BASE || !TRACKER_PROXY_SECRET) {
      return json(res, 500, {
        ok: false,
        build_tag: BUILD_TAG,
        error: "MISSING_ENV",
        diag: {
          has_SUPABASE_URL: !!SUPABASE_URL,
          has_SUPABASE_ANON_KEY: !!SUPABASE_ANON_KEY,
          has_SUPABASE_FUNCTIONS_BASE: !!SUPABASE_FUNCTIONS_BASE,
          has_TRACKER_PROXY_SECRET: !!TRACKER_PROXY_SECRET,
        },
      });
    }

    const userJwt = getBearerToken(req);
    if (!userJwt) {
      return json(res, 401, {
        ok: false,
        build_tag: BUILD_TAG,
        error: "MISSING_USER_JWT",
      });
    }

    const org_id = req.body?.org_id;
    if (!isUuid(org_id)) {
      return json(res, 400, {
        ok: false,
        build_tag: BUILD_TAG,
        error: "INVALID_ORG_ID",
      });
    }

    // Validar usuario con JWT real del tracker
    const sbUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${userJwt}`,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data: userData, error: userErr } = await sbUser.auth.getUser();

    if (userErr || !userData?.user?.id) {
      return json(res, 401, {
        ok: false,
        build_tag: BUILD_TAG,
        error: "INVALID_USER_JWT",
        detail: userErr?.message || null,
      });
    }

    const user_id = userData.user.id;
    const email = userData.user.email || null;

    const edgeBody = {
      org_id,
      user_id,
      email,
    };

    const rawBody = JSON.stringify(edgeBody);
    const ts = String(Date.now());
    const fn = "accept-tracker-invite";
    const signature = hmacHex(TRACKER_PROXY_SECRET, `${fn}.${ts}.${rawBody}`);

    const edgeUrl = `${SUPABASE_FUNCTIONS_BASE}/accept-tracker-invite`;

    const edgeRes = await fetch(edgeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Proxy-Ts": ts,
        "X-Proxy-Signature": signature,
      },
      body: rawBody,
    });

    let edgeJson = null;
    try {
      edgeJson = await edgeRes.json();
    } catch {
      edgeJson = null;
    }

    if (!edgeRes.ok) {
      return json(res, edgeRes.status, {
        ok: false,
        build_tag: BUILD_TAG,
        error: "EDGE_CALL_FAILED",
        edge_status: edgeRes.status,
        edge_response: edgeJson,
      });
    }

    return json(res, 200, {
      ok: true,
      build_tag: BUILD_TAG,
      proxy_user_id: user_id,
      proxy_org_id: org_id,
      edge_response: edgeJson,
    });
  } catch (e) {
    return json(res, 500, {
      ok: false,
      build_tag: BUILD_TAG,
      error: e?.message || String(e),
    });
  }
}