import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const BUILD_TAG = "accept-tracker-invite-proxy-v3_edge_url_fallback_20260305";

function json(res, status, payload) {
  res
    .status(status)
    .setHeader("Content-Type", "application/json; charset=utf-8")
    .send(JSON.stringify(payload));
}

function getEnvFirst(...names) {
  for (const n of names) {
    const v = String(process.env[n] || "").trim();
    if (v) return v;
  }
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

function buildFunctionCandidates(functionName) {
  const sbUrl = getEnvFirst("SUPABASE_URL", "VITE_SUPABASE_URL").replace(/\/+$/, "");
  const explicitFunctions = getEnvFirst("SUPABASE_FUNCTIONS_URL", "VITE_SUPABASE_FUNCTIONS_URL").replace(/\/+$/, "");

  const urls = [];

  if (explicitFunctions) {
    // Caso 1: viene como https://project.functions.supabase.co
    urls.push(`${explicitFunctions}/${functionName}`);

    // Caso 2: viene como https://project.supabase.co/functions/v1
    if (explicitFunctions.includes("/functions/v1")) {
      urls.push(`${explicitFunctions}/${functionName}`);
    }
  }

  if (sbUrl) {
    // Caso 3: URL REST estándar
    urls.push(`${sbUrl}/functions/v1/${functionName}`);

    // Caso 4: derivar functions.supabase.co desde SUPABASE_URL
    try {
      const u = new URL(sbUrl);
      const host = u.hostname;
      if (host.endsWith(".supabase.co")) {
        const projectRef = host.replace(".supabase.co", "");
        urls.push(`https://${projectRef}.functions.supabase.co/${functionName}`);
      }
    } catch {}
  }

  return [...new Set(urls.filter(Boolean))];
}

async function tryPostJson(url, rawBody, headers) {
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: rawBody,
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  return {
    ok: res.ok,
    status: res.status,
    url,
    data,
  };
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
    const SUPABASE_URL = getEnvFirst("SUPABASE_URL", "VITE_SUPABASE_URL");
    const SUPABASE_ANON_KEY = getEnvFirst("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY");
    const TRACKER_PROXY_SECRET = getEnvFirst("TRACKER_PROXY_SECRET", "VITE_TRACKER_PROXY_SECRET");

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !TRACKER_PROXY_SECRET) {
      return json(res, 500, {
        ok: false,
        build_tag: BUILD_TAG,
        error: "MISSING_ENV",
        diag: {
          has_SUPABASE_URL: !!SUPABASE_URL,
          has_SUPABASE_ANON_KEY: !!SUPABASE_ANON_KEY,
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

    const candidates = buildFunctionCandidates(fn);

    if (!candidates.length) {
      return json(res, 500, {
        ok: false,
        build_tag: BUILD_TAG,
        error: "NO_EDGE_URL_CANDIDATES",
      });
    }

    const headers = {
      "Content-Type": "application/json",
      "X-Proxy-Ts": ts,
      "X-Proxy-Signature": signature,
    };

    const attempts = [];
    for (const url of candidates) {
      try {
        const result = await tryPostJson(url, rawBody, headers);
        attempts.push(result);

        if (result.ok) {
          return json(res, 200, {
            ok: true,
            build_tag: BUILD_TAG,
            proxy_user_id: user_id,
            proxy_org_id: org_id,
            edge_url_used: result.url,
            edge_response: result.data,
            attempts,
          });
        }
      } catch (e) {
        attempts.push({
          ok: false,
          status: 0,
          url,
          data: { error: e?.message || String(e) },
        });
      }
    }

    const last = attempts[attempts.length - 1] || null;

    return json(res, last?.status || 502, {
      ok: false,
      build_tag: BUILD_TAG,
      error: "EDGE_CALL_FAILED",
      edge_url_candidates: candidates,
      attempts,
    });
  } catch (e) {
    return json(res, 500, {
      ok: false,
      build_tag: BUILD_TAG,
      error: e?.message || String(e),
    });
  }
}