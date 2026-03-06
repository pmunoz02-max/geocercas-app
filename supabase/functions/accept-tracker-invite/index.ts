import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") ?? "";

  const allowlist = [
    "https://app.tugeocercas.com",
    "https://preview.tugeocercas.com",
    "http://localhost:5173",
    "http://localhost:3000",
  ];

  const isVercelPreview =
    origin.endsWith(".vercel.app") || origin.includes("vercel.app");

  const isAllowed = allowlist.includes(origin) || isVercelPreview;

  const allowOrigin = origin && isAllowed ? origin : (origin ? "" : "*");

  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-proxy-ts, x-proxy-signature",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };

  if (allowOrigin) headers["Access-Control-Allow-Origin"] = allowOrigin;

  return headers;
}

function json(req: Request, status: number, obj: unknown) {
  const cors = getCorsHeaders(req);
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

async function hmacHex(secret: string, msg: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

serve(async (req) => {
  const build_tag = "accept-tracker-invite-v9_memberships_canonical_20260305";

  try {
    if (req.method === "OPTIONS") {
      return json(req, 200, { ok: true, build_tag });
    }

    if (req.method !== "POST") {
      return json(req, 405, {
        ok: false,
        build_tag,
        error: "METHOD_NOT_ALLOWED",
      });
    }

    const SB_URL = Deno.env.get("SB_URL");
    const SB_SERVICE_ROLE = Deno.env.get("SB_SERVICE_ROLE");
    const TRACKER_PROXY_SECRET = Deno.env.get("TRACKER_PROXY_SECRET");

    if (!SB_URL || !SB_SERVICE_ROLE || !TRACKER_PROXY_SECRET) {
      return json(req, 500, {
        ok: false,
        build_tag,
        error: "Missing env",
        diag: {
          hasSbUrl: !!SB_URL,
          hasSbServiceRole: !!SB_SERVICE_ROLE,
          hasTrackerProxySecret: !!TRACKER_PROXY_SECRET,
        },
      });
    }

    const ts = req.headers.get("X-Proxy-Ts") || "";
    const signature = req.headers.get("X-Proxy-Signature") || "";

    const rawBody = await req.text();
    const fn = "accept-tracker-invite";
    const expected = await hmacHex(
      TRACKER_PROXY_SECRET,
      `${fn}.${ts}.${rawBody}`,
    );

    if (!ts || !signature || expected !== signature) {
      return json(req, 401, {
        ok: false,
        build_tag,
        error: "Invalid proxy signature",
      });
    }

    let body: any = {};
    try {
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      body = {};
    }

    const org_id = body?.org_id;
    const user_id = body?.user_id;
    const email = body?.email;

    if (!org_id) {
      return json(req, 400, {
        ok: false,
        build_tag,
        error: "Missing org_id",
      });
    }

    const admin = createClient(SB_URL, SB_SERVICE_ROLE);

    let resolvedUserId = user_id ?? null;

    // Fallback por email si no vino user_id
    if (!resolvedUserId && email) {
      const { data, error } = await admin
        .from("profiles")
        .select("id")
        .eq("email", email)
        .maybeSingle();

      if (error) {
        return json(req, 500, {
          ok: false,
          build_tag,
          error: "Resolve user by email failed",
          detail: error.message,
        });
      }

      resolvedUserId = data?.id ?? null;
    }

    if (!resolvedUserId) {
      return json(req, 400, {
        ok: false,
        build_tag,
        error: "Missing user_id (or email not found)",
      });
    }

    // 1) CANÓNICO: memberships
    // PK real: (org_id, user_id)
    const membershipRow = {
      org_id,
      user_id: resolvedUserId,
      role: "tracker",
      is_default: true,
      revoked_at: null,
    };

    const { error: membershipsErr } = await admin
      .from("memberships")
      .upsert(membershipRow, { onConflict: "org_id,user_id" });

    if (membershipsErr) {
      return json(req, 500, {
        ok: false,
        build_tag,
        error: "Upsert memberships failed",
        detail: membershipsErr.message,
      });
    }

    // 2) ORG ACTIVA persistente (best-effort, no fatal)
    let setOrgOk = false;
    let setOrgError: string | null = null;

    try {
      const { error } = await admin.rpc("set_current_org", { p_org_id: org_id });
      if (error) {
        setOrgError = error.message;
      } else {
        setOrgOk = true;
      }
    } catch (e: any) {
      setOrgError = e?.message ?? String(e);
    }

    // 3) LEGACY COMPAT: user_organizations (best-effort, no fatal)
    let legacyOk = false;
    let legacyError: string | null = null;

    try {
      const { error } = await admin
        .from("user_organizations")
        .upsert(
          {
            user_id: resolvedUserId,
            org_id,
            role: "tracker",
          },
          { onConflict: "org_id,user_id" },
        );

      if (error) {
        legacyError = error.message;
      } else {
        legacyOk = true;
      }
    } catch (e: any) {
      legacyError = e?.message ?? String(e);
    }

    return json(req, 200, {
      ok: true,
      build_tag,
      user_id: resolvedUserId,
      org_id,
      canonical_membership: true,
      current_org_persisted: setOrgOk,
      current_org_error: setOrgError,
      legacy_user_organizations_ok: legacyOk,
      legacy_user_organizations_error: legacyError,
    });
  } catch (e: any) {
    return json(req, 500, {
      ok: false,
      build_tag,
      error: e?.message ?? String(e),
    });
  }
});