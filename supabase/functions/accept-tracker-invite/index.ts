import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * CORS universal + whitelist.
 * - Siempre devolver headers CORS (éxito y error).
 * - Soporta OPTIONS correctamente.
 */
function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") ?? "";

  // ✅ Ajusta aquí si quieres ser más estricto.
  // Incluimos producción, previews de Vercel y localhost.
  const allowlist = [
    "https://app.tugeocercas.com",
    "http://localhost:5173",
    "http://localhost:3000",
  ];

  // Permitir previews de Vercel (*.vercel.app) y tu dominio preview si aplica.
  const isVercelPreview =
    origin.endsWith(".vercel.app") ||
    origin.includes("vercel.app");

  const isAllowed = allowlist.includes(origin) || isVercelPreview;

  // Si no hay origin (curl/server-to-server), no bloqueamos.
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
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  const build_tag = "accept-tracker-invite-v8_cors_always_20260227";

  try {
    // ✅ CORS preflight
    if (req.method === "OPTIONS") {
      // responder sin depender del body
      return json(req, 200, { ok: true, build_tag });
    }

    if (req.method !== "POST") {
      return json(req, 405, { ok: false, build_tag, error: "METHOD_NOT_ALLOWED" });
    }

    // ✅ Secrets (Supabase no permite SUPABASE_*)
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

    // ✅ Validate proxy signature (same pattern as send_position)
    const ts = req.headers.get("X-Proxy-Ts") || "";
    const signature = req.headers.get("X-Proxy-Signature") || "";

    const rawBody = await req.text(); // exact bytes as received
    const fn = "accept-tracker-invite";

    const expected = await hmacHex(TRACKER_PROXY_SECRET, `${fn}.${ts}.${rawBody}`);

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
    const user_id = body?.user_id; // recomendado: mandar user_id
    const email = body?.email;     // fallback si mandas email

    if (!org_id) return json(req, 400, { ok: false, build_tag, error: "Missing org_id" });

    const admin = createClient(SB_URL, SB_SERVICE_ROLE);

    let resolvedUserId = user_id;

    // Fallback: si no hay user_id, intentamos resolver por email en profiles (si tu modelo lo permite)
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
      resolvedUserId = data?.id;
    }

    if (!resolvedUserId) {
      return json(req, 400, { ok: false, build_tag, error: "Missing user_id (or email not found)" });
    }

    // ✅ Upsert membership tracker
    const { error: upsertErr } = await admin
      .from("user_organizations")
      .upsert(
        { user_id: resolvedUserId, org_id, role: "tracker" },
        { onConflict: "user_id,org_id" },
      );

    if (upsertErr) {
      return json(req, 500, { ok: false, build_tag, error: "Upsert failed", detail: upsertErr.message });
    }

    return json(req, 200, { ok: true, build_tag, user_id: resolvedUserId, org_id });
  } catch (e) {
    return json(req, 500, {
      ok: false,
      build_tag,
      error: String((e as any)?.message ?? e),
    });
  }
});