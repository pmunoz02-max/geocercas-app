import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, x-api-key, content-type",
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
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
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
  const h = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return (m?.[1] || "").trim();
}

function decodeJwtPayload(jwt: string): any | null {
  try {
    const part = jwt.split(".")[1];
    if (!part) return null;
    return JSON.parse(atob(part));
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
    const SUPABASE_SERVICE_ROLE_KEY = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();

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
    if (!isUuid(orgId)) {
      return jsonResponse(400, { ok: false, error: "org_id is required" });
    }

    const nowIso = new Date().toISOString();
    const nowMs = Date.now();

    // ─────────────────────────────────────────────────────────────────────────────
    // 1) Validación UNIVERSAL: el JWT debe pertenecer al MISMO proyecto que SUPABASE_URL
    // ─────────────────────────────────────────────────────────────────────────────
    const payload = decodeJwtPayload(jwt);
    const expectedIss = `${SUPABASE_URL.replace(/\/+$/, "")}/auth/v1`;

    if (!payload?.iss || String(payload.iss) !== expectedIss) {
      // Esto detecta inmediatamente mezclas de proyectos / secrets equivocados
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

    // Cliente usuario: validamos token con Auth del MISMO proyecto
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

    // Cliente admin para escrituras
    const sbAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // 2) Si membership existe y NO está revocado => asegurar role=tracker solo en ESA org
    // ─────────────────────────────────────────────────────────────────────────────
    const { data: mem, error: memErr } = await sbAdmin
      .from("memberships")
      .select("org_id, user_id, role, revoked_at")
      .eq("org_id", orgId)
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    if (memErr) return jsonResponse(500, { ok: false, error: "DB error memberships select", detail: memErr.message });

    const membershipActive = !!mem && !mem.revoked_at;

    if (membershipActive) {
      if (String(mem.role) !== "tracker") {
        const { error: upErr } = await sbAdmin
          .from("memberships")
          .update({ role: "tracker", revoked_at: null })
          .eq("org_id", orgId)
          .eq("user_id", userId);

        if (upErr) {
          return jsonResponse(500, { ok: false, error: "Failed to upgrade role to tracker", detail: upErr.message });
        }
      }

      await sbAdmin.from("user_current_org").upsert(
        { user_id: userId, org_id: orgId, updated_at: nowIso },
        { onConflict: "user_id" },
      );

      return jsonResponse(200, {
        ok: true,
        org_id: orgId,
        user_id: userId,
        role: "tracker",
        mode: "membership_exists",
      });
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // 3) Si no hay membership activa => requiere invite activo para esa org + email_norm
    // ─────────────────────────────────────────────────────────────────────────────
    const { data: inv, error: invErr } = await sbAdmin
      .from("tracker_invites")
      .select("id, org_id, email_norm, is_active, expires_at, used_at, used_by_user_id, created_at")
      .eq("org_id", orgId)
      .eq("email_norm", email)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (invErr) return jsonResponse(500, { ok: false, error: "DB error tracker_invites select", detail: invErr.message });

    if (!inv) {
      return jsonResponse(404, {
        ok: false,
        error: "No pending invite found for this email in this org",
        org_id: orgId,
        email,
      });
    }

    // Expiry robusto (numérico)
    if (inv.expires_at) {
      const expMs = Date.parse(String(inv.expires_at));
      if (!Number.isNaN(expMs) && expMs <= nowMs) {
        return jsonResponse(410, { ok: false, error: "Invite expired", org_id: orgId });
      }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // 4) Marcar invite usada (idempotente)
    // ─────────────────────────────────────────────────────────────────────────────
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

      if (markErr) return jsonResponse(500, { ok: false, error: "Failed to mark invite used", detail: markErr.message });
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // 5) Asegurar membership tracker SOLO en esa org (sin tocar otras)
    // ─────────────────────────────────────────────────────────────────────────────
    const { error: upsertErr } = await sbAdmin.from("memberships").upsert(
      { org_id: orgId, user_id: userId, role: "tracker", revoked_at: null, is_default: false },
      { onConflict: "org_id,user_id" },
    );

    if (upsertErr) {
      return jsonResponse(500, { ok: false, error: "Failed to ensure membership tracker", detail: upsertErr.message });
    }

    // 6) UX: current org = org del link
    const { error: ucoErr } = await sbAdmin.from("user_current_org").upsert(
      { user_id: userId, org_id: orgId, updated_at: nowIso },
      { onConflict: "user_id" },
    );
    if (ucoErr) {
      // No bloquea membership, pero lo reportamos
      return jsonResponse(200, {
        ok: true,
        org_id: orgId,
        user_id: userId,
        role: "tracker",
        mode: "invite_accepted",
        warning: "user_current_org upsert failed",
        warning_detail: ucoErr.message,
      });
    }

    return jsonResponse(200, { ok: true, org_id: orgId, user_id: userId, role: "tracker", mode: "invite_accepted" });
  } catch (e) {
    return jsonResponse(500, { ok: false, error: "Unhandled", detail: String((e as any)?.message || e) });
  }
});
