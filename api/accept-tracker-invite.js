import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const BUILD_TAG = "accept-tracker-invite-proxy-v4_strict_preview_functions_20260305";

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

function normalizeFunctionsBase(raw) {
  const s = String(raw || "").trim().replace(/\/+$/, "");
  if (!s) return "";

  // Aceptar:
  // https://<ref>.functions.supabase.co
  // https://<ref>.supabase.co/functions/v1
  if (/^https:\/\/[a-z0-9]+\.functions\.supabase\.co$/i.test(s)) return s;
  if (/^https:\/\/[a-z0-9]+\.supabase\.co\/functions\/v1$/i.test(s)) return s;

  // Si viene con /accept-tracker-invite al final o URL REST pura, la ignoramos
  return "";
}

function deriveFunctionsBasesFromSupabaseUrl(sbUrl) {
  const s = String(sbUrl || "").trim().replace(/\/+$/, "");
  if (!s) return [];

  try {
    const u = new URL(s);
    const host = u.hostname;
    if (!host.endsWith(".supabase.co")) return [];
    const ref = host.replace(".supabase.co", "");
    return [
      `https://${ref}.supabase.co/functions/v1`,
      `https://${ref}.functions.supabase.co`,
    ];
  } catch {
    return [];
  }
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

    const explicitFunctionsRaw = getEnvFirst("SUPABASE_FUNCTIONS_URL", "VITE_SUPABASE_FUNCTIONS_URL");
    const explicitFunctionsBase = normalizeFunctionsBase(explicitFunctionsRaw);

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !TRACKER_PROXY_SECRET) {
      return json(res, 500, {
        ok: false,
        build_tag: BUILD_TAG,
        error: "MISSING_ENV",
        diag: {
          has_SUPABASE_URL: !!SUPABASE_URL,
          has_SUPABASE_ANON_KEY: !!SUPABASE_ANON_KEY,
          has_TRACKER_PROXY_SECRET: !!TRACKER_PROXY_SECRET,
          explicit_functions_raw: explicitFunctionsRaw || null,
          explicit_functions_base: explicitFunctionsBase || null,
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

    const edgeBody = { org_id, user_id, email };
    const rawBody = JSON.stringify(edgeBody);
    const ts = String(Date.now());
    const fn = "accept-tracker-invite";
    const signature = hmacHex(TRACKER_PROXY_SECRET, `${fn}.${ts}.${rawBody}`);

    const candidateBases = [
      ...(explicitFunctionsBase ? [explicitFunctionsBase] : []),
      ...deriveFunctionsBasesFromSupabaseUrl(SUPABASE_URL),
    ];

    const uniqueBases = [...new Set(candidateBases.filter(Boolean))];
    const candidates = uniqueBases.map((b) => `${b}/${fn}`);

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

        // --- [plan-enforcement][tracker-create] Interceptar error comercial TRACKER_LIMIT_REACHED ---
        if (!result.ok && result.data) {
          // 1) Si viene en result.data.detail como string JSON serializado
          if (typeof result.data.detail === 'string') {
            try {
              const parsed = JSON.parse(result.data.detail);
              if (parsed && parsed.code === 'TRACKER_LIMIT_REACHED') {
                return json(res, 403, {
                  ok: false,
                  code: 'TRACKER_LIMIT_REACHED',
                  message: 'Límite de trackers alcanzado para el plan actual.',
                  upgrade_required: true,
                  detail: parsed,
                });
              }
            } catch {}
          }
          // 2) Si viene en result.data.code directamente
          if (result.data.code === 'TRACKER_LIMIT_REACHED') {
            return json(res, 403, {
              ok: false,
              code: 'TRACKER_LIMIT_REACHED',
              message: 'Límite de trackers alcanzado para el plan actual.',
              upgrade_required: true,
              detail: result.data,
            });
          }
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
      explicit_functions_raw: explicitFunctionsRaw || null,
      explicit_functions_base: explicitFunctionsBase || null,
      supabase_url_used: SUPABASE_URL,
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