/// <reference lib="deno.ns" />
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const build_tag = "send_position-v16_at_optional_fallback_20260226";

function buildCorsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Headers": [
      "authorization",
      "x-client-info",
      "apikey",
      "content-type",
      "x-proxy-ts",
      "x-proxy-signature",
      "x-tracker-ts",
      "x-tracker-nonce",
      "x-tracker-sig",
      "x-user-jwt",
    ].join(", "),
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(body: unknown, status: number, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

async function hmacHex(secret: string, msg: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, encoder.encode(msg));
  return Array.from(new Uint8Array(sigBuf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ✅ No mutar token
function pickBearer(h: string | null) {
  const s = String(h || "").trim();
  if (!s) return "";
  return /^bearer\s+/i.test(s) ? s : `Bearer ${s}`;
}

// ✅ Universal env resolver
function getEnv() {
  const SB_URL =
    Deno.env.get("SB_URL") ||
    Deno.env.get("SUPABASE_URL") ||
    Deno.env.get("API_URL") ||
    "";

  const SB_SERVICE_ROLE =
    Deno.env.get("SB_SERVICE_ROLE") ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    Deno.env.get("SB_SERVICE_ROLE_KEY") ||
    "";

  const TRACKER_PROXY_SECRET =
    Deno.env.get("TRACKER_PROXY_SECRET") ||
    Deno.env.get("PROXY_SECRET") ||
    Deno.env.get("INVITE_PROXY_SECRET") ||
    "";

  return { SB_URL, SB_SERVICE_ROLE, TRACKER_PROXY_SECRET };
}

// ✅ Universal insert: si tabla no tiene columna 'at', reintenta sin 'at'
async function insertPositionUniversal(
  admin: any,
  row: Record<string, unknown>,
) {
  // intento 1: tal cual (incluye at si viene)
  const r1 = await admin.from("positions").insert(row);
  if (!r1?.error) return { ok: true, attempted: "with_at_or_as_given", result: r1 };

  const msg = String(r1.error?.message || "");
  const isAtMissing =
    msg.includes("Could not find the 'at' column") ||
    msg.includes("Could not find the \"at\" column") ||
    msg.toLowerCase().includes("could not find the 'at' column");

  if (!isAtMissing) {
    return { ok: false, attempted: "with_at_or_as_given", error: r1.error };
  }

  // intento 2: sin 'at'
  const { at, ...rowNoAt } = row as any;
  const r2 = await admin.from("positions").insert(rowNoAt);
  if (!r2?.error) return { ok: true, attempted: "without_at_fallback", result: r2 };

  return { ok: false, attempted: "without_at_fallback", error: r2.error };
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  const CORS = buildCorsHeaders(origin);

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const { SB_URL, SB_SERVICE_ROLE, TRACKER_PROXY_SECRET } = getEnv();

  if (req.method === "GET") {
    return json(
      {
        ok: true,
        build_tag,
        now: new Date().toISOString(),
        env: {
          has_SB_URL: !!SB_URL,
          has_SB_SERVICE_ROLE: !!SB_SERVICE_ROLE,
          has_TRACKER_PROXY_SECRET: !!TRACKER_PROXY_SECRET,
        },
        headers_seen: {
          has_authorization: !!req.headers.get("authorization"),
          has_x_user_jwt: !!req.headers.get("x-user-jwt"),
          has_x_proxy_ts: !!req.headers.get("x-proxy-ts"),
          has_x_proxy_signature: !!req.headers.get("x-proxy-signature"),
        },
        hint: "POST web_auth: send x-user-jwt (raw jwt or Bearer <jwt>) OR Authorization. Proxy mode requires x-proxy-* + a secret.",
      },
      200,
      CORS,
    );
  }

  if (req.method !== "POST") return json({ ok: false, build_tag, error: "Method not allowed" }, 405, CORS);

  try {
    if (!SB_URL || !SB_SERVICE_ROLE) {
      return json(
        { ok: false, build_tag, error: "Missing required env vars (SB_URL / SB_SERVICE_ROLE)" },
        500,
        CORS,
      );
    }

    const rawBody = await req.text();
    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return json({ ok: false, build_tag, error: "Invalid JSON body" }, 400, CORS);
    }

    // Proxy HMAC mode
    const ts = req.headers.get("x-proxy-ts");
    const signature = req.headers.get("x-proxy-signature");
    const hasProxyHeaders = Boolean(ts && signature);

    if (hasProxyHeaders) {
      if (!TRACKER_PROXY_SECRET) {
        return json({ ok: false, build_tag, error: "Proxy mode requires proxy secret" }, 500, CORS);
      }

      const fn = "send_position";
      const expected = await hmacHex(TRACKER_PROXY_SECRET, `${fn}.${ts}.${rawBody}`);
      if (expected !== signature) {
        return json({ ok: false, build_tag, error: "Invalid proxy signature" }, 401, CORS);
      }

      const { user_id, org_id, lat, lng } = body ?? {};
      if (!user_id || !org_id || typeof lat !== "number" || typeof lng !== "number") {
        return json({ ok: false, build_tag, error: "Missing/invalid fields (proxy mode)" }, 400, CORS);
      }

      const admin = createClient(SB_URL, SB_SERVICE_ROLE);

      const row = {
        user_id,
        org_id,
        lat,
        lng,
        accuracy: body?.accuracy ?? null,
        // 'at' opcional: si la tabla no tiene esa columna, hacemos fallback sin 'at'
        at: body?.at ?? null,
        source: body?.source ?? "proxy_hmac",
      };

      const ins = await insertPositionUniversal(admin, row);
      if (!ins.ok) return json({ ok: false, build_tag, error: ins.error?.message ?? String(ins.error) }, 500, CORS);

      return json({ ok: true, build_tag, mode: "proxy_hmac", insert: ins.attempted }, 200, CORS);
    }

    // Web auth mode
    const userJwtHeader = req.headers.get("x-user-jwt");
    const authHeader = req.headers.get("authorization");
    const effectiveUserAuth = pickBearer(userJwtHeader || authHeader);

    if (!effectiveUserAuth) {
      return json({ ok: false, build_tag, error: "Missing x-user-jwt/Authorization (web mode)" }, 401, CORS);
    }

    const admin = createClient(SB_URL, SB_SERVICE_ROLE, {
      global: { headers: { Authorization: effectiveUserAuth } },
    });

    const { data: userData, error: userErr } = await admin.auth.getUser();
    if (userErr || !userData?.user?.id) {
      return json({ ok: false, build_tag, error: "Invalid JWT", detail: userErr?.message ?? null }, 401, CORS);
    }

    const user_id = userData.user.id;
    const { org_id, lat, lng } = body ?? {};
    if (!org_id || typeof lat !== "number" || typeof lng !== "number") {
      return json({ ok: false, build_tag, error: "Missing/invalid fields (web mode)" }, 400, CORS);
    }

    const row = {
      user_id,
      org_id,
      lat,
      lng,
      accuracy: body?.accuracy ?? null,
      // 'at' opcional (fallback si no existe)
      at: body?.at ?? null,
      source: body?.source ?? "tracker-gps-web",
    };

    const ins = await insertPositionUniversal(admin, row);
    if (!ins.ok) return json({ ok: false, build_tag, error: ins.error?.message ?? String(ins.error) }, 500, CORS);

    return json({ ok: true, build_tag, mode: "web_auth", insert: ins.attempted }, 200, CORS);
  } catch (err: any) {
    return json({ ok: false, build_tag, error: err?.message ?? String(err) }, 500, CORS);
  }
});