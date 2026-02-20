import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, x-api-key, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isUuid(v: unknown) {
  const s = String(v ?? "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s,
  );
}

function normEmail(email: string) {
  return String(email || "").trim().toLowerCase();
}

function pickOrgId(reqUrl: string, body: any) {
  const url = new URL(reqUrl);
  const qOrg = (url.searchParams.get("org_id") ||
    url.searchParams.get("org") ||
    url.searchParams.get("orgId") ||
    "").trim();

  const bOrg = String(body?.org_id || body?.org || body?.orgId || "").trim();

  return (isUuid(qOrg) ? qOrg : (isUuid(bOrg) ? bOrg : "")).trim();
}

function getBearerToken(req: Request) {
  const h =
    req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return (m?.[1] || "").trim();
}

/**
 * JWT payload decode (base64url safe)
 */
function base64UrlDecode(input: string): string {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
  return atob(b64 + pad);
}

function decodeJwtPayload(jwt: string): any | null {
  try {
    const part = String(jwt || "").split(".")[1];
    if (!part) return null;
    const json = base64UrlDecode(part);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse(405, { ok: false, error: "Method not allowed" });

  try {
    const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") || "").trim();
    const SUPABASE_ANON_KEY = (Deno.env.get("SUPABASE_ANON_KEY") || "").trim();
    const SUPABASE_SERVICE_ROLE_KEY =
      (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      return jsonResponse(500, {
        ok: false,
        error: "Missing SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY",
      });
    }

    const jwt = getBearerToken(req);
    if (!jwt) return jsonResponse(401, { ok: false, error: "Missing Bearer token" });

    const body = await req.json().catch(() => ({}));
    const orgId = pickOrgId(req.url, body);
    if (!isUuid(orgId)) return jsonResponse(400, { ok: false, error: "org_id is required" });

    const nowIso = new Date().toISOString();
    const nowMs = Date.now();

    /**
     * Guard-rail UNIVERSAL: el token debe pertenecer al MISMO proyecto que este function env.
     * Esto evita mezcla Preview/Prod y secrets cruzados.
     */
    const payload = decodeJwtPayload(jwt);
    const expectedIss = `${SUPABASE_URL.replace(/\/+$/, "")}/auth/v1`;

    if (!payload?.iss || String(payload.iss) !== expectedIss) {
      return jsonResponse(401, {
        ok: false,
        error: "Invalid JWT (issuer mismatch)",
        hint: {
          expected_iss: expectedIss,
          token_iss: payload?.iss || null,
          token_aud: payload?.aud || null,
        },
      });
    }

    // Cliente usuario: valida token contra Auth del mismo proyecto
    const sbUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userErr } = await sbUser.auth.getUser(jwt);
    if (userErr || !userData?.user?.id) {
      return jsonResponse(401, {
        ok: false,
        error: "Invalid JWT",
        detail: userErr?.message || "auth.getUser failed",
        hint: {
          expected_iss: expectedIss,
          token_aud: payload?.aud || null,
          token_exp: payload?.exp || null,
        },
      });
    }

    const userId = userData.user.id;
    const email = normEmail(userData.user.email || "");

    // Cliente admin (service role) para lecturas/escrituras sin RLS
    const sbAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    /**
     * 1) Si ya hay membership activa en ESA org:
     *    - NO tocar el rol (puede ser owner/admin y no queremos degradar)
     *    - SIEMPRE fijar user_current_org a orgId (UX: entra a la org del link)
     */
    const { data: mem, error: memErr } = await sbAdmin
      .from("memberships")
      .select("org_id, user_id, role, revoked_at")
      .eq("org_id", orgId)
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    if (memErr) {
      return jsonResponse(500, {
        ok: false,
        error: "DB error memberships select",
        detail: memErr.message,
      });
    }

    const membershipActive = !!mem && !mem.revoked_at;

    if (membershipActive) {
      const { error: ucoErr } = await sbAdmin.from("user_current_org").upsert(
        { user_id: userId, org_id: orgId, updated_at: nowIso },
        { onConflict: "user_id" },
      );

      return jsonResponse(200, {
        ok: true,
        org_id: orgId,
        user_id: userId,
        role: mem?.role || "unknown",
        mode: "membership_exists",
        warning: ucoErr ? "user_current_org upsert failed" : null,
        warning_detail: ucoErr ? ucoErr.message : null,
      });
    }

    /**
     * 2) Si no hay membership activa:
     *    - Debe existir INVITE activo para esa org + email_norm
     */
    const { data: inv, error: invErr } = await sbAdmin
      .from("tracker_invites")
      .select("id, org_id, email_norm, is_active, expires_at, used_at, used_by_user_id, created_at")
      .eq("org_id", orgId)
      .eq("email_norm", email)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (invErr) {
      return jsonResponse(500, {
        ok: false,
        error: "DB error tracker_invites select",
        detail: invErr.message,
      });
    }

    if (!inv) {
      return jsonResponse(404, {
        ok: false,
        error: "No pending invite found for this email in this org",
        org_id: orgId,
        email,
      });
    }

    // Expiry robusto
    if (inv.expires_at) {
      const expMs = Date.parse(String(inv.expires_at));
      if (!Number.isNaN(expMs) && expMs <= nowMs) {
        return jsonResponse(410, { ok: false, error: "Invite expired", org_id: orgId });
      }
    }

    /**
     * 3) Marcar invite usada (idempotente)
     */
    if (!inv.used_at || !inv.used_by_user_id) {
      const { error: markErr } = await sbAdmin
        .from("tracker_invites")
        .update({
          used_at: nowIso,
          used_by_user_id: userId,
          accepted_at: nowIso,
          is_active: false,
        })
        .eq("id", inv.id);

      if (markErr) {
        return jsonResponse(500, {
          ok: false,
          error: "Failed to mark invite used",
          detail: markErr.message,
        });
      }
    }

    /**
     * 4) Crear/asegurar membership tracker SOLO en ESA org (sin tocar otras orgs)
     */
    const { error: upsertErr } = await sbAdmin.from("memberships").upsert(
      { org_id: orgId, user_id: userId, role: "tracker", revoked_at: null, is_default: false },
      { onConflict: "org_id,user_id" },
    );

    if (upsertErr) {
      return jsonResponse(500, {
        ok: false,
        error: "Failed to ensure membership tracker",
        detail: upsertErr.message,
      });
    }

    /**
     * 5) UX: org activa = org del link (siempre)
     */
    const { error: ucoErr2 } = await sbAdmin.from("user_current_org").upsert(
      { user_id: userId, org_id: orgId, updated_at: nowIso },
      { onConflict: "user_id" },
    );

    return jsonResponse(200, {
      ok: true,
      org_id: orgId,
      user_id: userId,
      role: "tracker",
      mode: "invite_accepted",
      warning: ucoErr2 ? "user_current_org upsert failed" : null,
      warning_detail: ucoErr2 ? ucoErr2.message : null,
    });
  } catch (e) {
    return jsonResponse(500, {
      ok: false,
      error: "Unhandled",
      detail: String((e as any)?.message || e),
    });
  }
});