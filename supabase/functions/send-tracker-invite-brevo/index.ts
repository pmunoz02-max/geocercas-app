import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const BUILD_TAG = "send-tracker-invite-brevo-x-user-jwt-20260216";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, x-api-key, content-type, x-user-jwt",
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

function isPgUniqueViolation(err: any) {
  const code = err?.code || err?.details?.code;
  return String(code) === "23505";
}

function looksLikeJwt(t: string) {
  const s = String(t || "").trim();
  // JWT = 3 partes separadas por "."
  return s.split(".").length === 3;
}

// ✅ CANÓNICO: callback existente
function buildRedirectTo(appPreviewUrl: string, orgId: string) {
  const base = appPreviewUrl.replace(/\/$/, "");
  const next = `/tracker-gps?org_id=${encodeURIComponent(orgId)}`;
  return `${base}/auth/callback?next=${encodeURIComponent(next)}`;
}

async function brevoSendEmail(opts: {
  apiKey: string;
  senderEmail: string;
  senderName: string;
  toEmail: string;
  toName?: string;
  subject: string;
  html: string;
  text?: string;
}) {
  const payload = {
    sender: { email: opts.senderEmail, name: opts.senderName },
    to: [{ email: opts.toEmail, name: opts.toName || opts.toEmail }],
    subject: opts.subject,
    htmlContent: opts.html,
    textContent: opts.text || undefined,
  };

  const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": opts.apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await resp.text();
  if (!resp.ok) throw new Error(`Brevo send failed: ${resp.status} ${text}`);
  return text;
}

/**
 * ✅ Validación robusta del JWT del usuario usando /auth/v1/user
 * NOTA: aquí jwt es el x-user-jwt (NO Authorization)
 */
async function authUserIdFromJwt(params: { supabaseUrl: string; anonKey: string; jwt: string }) {
  const url = `${params.supabaseUrl.replace(/\/$/, "")}/auth/v1/user`;
  const r = await fetch(url, {
    method: "GET",
    headers: {
      apikey: params.anonKey,
      Authorization: `Bearer ${params.jwt}`,
    },
  });

  const text = await r.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }

  if (!r.ok) return { ok: false as const, status: r.status, body: json };

  const id = json?.id ? String(json.id) : "";
  if (!id) return { ok: false as const, status: 500, body: { error: "NO_USER_ID", raw: json } };
  return { ok: true as const, user_id: id };
}

/**
 * “Open invite” = cualquiera que pueda chocar con tus uniques:
 * - used_at IS NULL (pending unique)
 * - is_active = true (active unique)
 * - accepted_at IS NULL (email unique)
 */
async function findOpenInvite(sbAdmin: any, org_id: string, email_norm: string) {
  const { data, error } = await sbAdmin
    .from("tracker_invites")
    .select("id, org_id, email, email_norm, is_active, used_at, accepted_at, created_at")
    .eq("org_id", org_id)
    .eq("email_norm", email_norm)
    .or("accepted_at.is.null,used_at.is.null,is_active.eq.true")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function deactivateOtherActives(sbAdmin: any, org_id: string, email_norm: string, keepId: string) {
  const { error } = await sbAdmin
    .from("tracker_invites")
    .update({ is_active: false } as any)
    .eq("org_id", org_id)
    .eq("email_norm", email_norm)
    .neq("id", keepId)
    .eq("is_active", true);

  if (error) throw error;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse(405, { ok: false, error: "Method not allowed", build_tag: BUILD_TAG });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";

    const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY") || "";
    const BREVO_SENDER_EMAIL = Deno.env.get("BREVO_SENDER_EMAIL") || "";
    const BREVO_SENDER_NAME = Deno.env.get("BREVO_SENDER_NAME") || "App Geocercas";
    const APP_PREVIEW_URL = (Deno.env.get("APP_PREVIEW_URL") || "https://preview.tugeocercas.com").replace(/\/$/, "");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return jsonResponse(500, { ok: false, error: "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY", build_tag: BUILD_TAG });
    }
    if (!SUPABASE_ANON_KEY) {
      return jsonResponse(500, { ok: false, error: "Missing SUPABASE_ANON_KEY", build_tag: BUILD_TAG });
    }
    if (!BREVO_API_KEY || !BREVO_SENDER_EMAIL) {
      return jsonResponse(500, { ok: false, error: "Missing BREVO_API_KEY / BREVO_SENDER_EMAIL", build_tag: BUILD_TAG });
    }

    // ✅ 100% x-user-jwt (Authorization ya NO es user jwt)
    const userJwt = (req.headers.get("x-user-jwt") || "").trim();
    if (!userJwt) {
      return jsonResponse(401, { ok: false, error: "Missing x-user-jwt", build_tag: BUILD_TAG });
    }
    if (!looksLikeJwt(userJwt)) {
      return jsonResponse(401, { ok: false, error: "Invalid x-user-jwt format", build_tag: BUILD_TAG });
    }

    const sbAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // ✅ validar caller (quien invita)
    const u = await authUserIdFromJwt({ supabaseUrl: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY, jwt: userJwt });
    if (!u.ok) {
      return jsonResponse(401, { ok: false, error: "Invalid JWT", detail: u.body, status: u.status, build_tag: BUILD_TAG });
    }
    const callerUserId = u.user_id;

    const body = await req.json().catch(() => ({}));
    const org_id = String(body?.org_id || "").trim();
    const email = normEmail(body?.email || "");
    const to_name = String(body?.name || "").trim() || undefined;

    if (!isUuid(org_id)) return jsonResponse(400, { ok: false, error: "Invalid org_id", build_tag: BUILD_TAG });
    if (!email || !email.includes("@")) return jsonResponse(400, { ok: false, error: "Invalid email", build_tag: BUILD_TAG });

    // ✅ Caller debe ser owner de esa org
    const { data: ownerRow, error: ownerErr } = await sbAdmin
      .from("memberships")
      .select("role, revoked_at")
      .eq("org_id", org_id)
      .eq("user_id", callerUserId)
      .is("revoked_at", null)
      .limit(1)
      .maybeSingle();

    if (ownerErr) return jsonResponse(500, { ok: false, error: "DB error checking owner", detail: ownerErr.message, build_tag: BUILD_TAG });
    if (!ownerRow || String(ownerRow.role) !== "owner") {
      return jsonResponse(403, { ok: false, error: "Not allowed (must be owner of org)", build_tag: BUILD_TAG });
    }

    const nowIso = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();
    const redirectTo = buildRedirectTo(APP_PREVIEW_URL, org_id);

    // ✅ DB idempotente + retry por carreras
    let trackerInviteId: string | null = null;
    let mode: "updated" | "inserted" | null = null;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const open = await findOpenInvite(sbAdmin, org_id, email);

        if (open?.id) {
          const { error: updErr } = await sbAdmin
            .from("tracker_invites")
            .update({
              email,
              email_norm: email,
              is_active: true,
              expires_at: expiresAt,
            } as any)
            .eq("id", open.id);

          if (updErr) throw updErr;

          await deactivateOtherActives(sbAdmin, org_id, email, open.id);

          trackerInviteId = open.id;
          mode = "updated";
        } else {
          const { data: invRow, error: insErr } = await sbAdmin
            .from("tracker_invites")
            .insert({
              org_id,
              email,
              email_norm: email,
              created_by_user_id: callerUserId,
              created_at: nowIso,
              expires_at: expiresAt,
              used_at: null,
              used_by_user_id: null,
              accepted_at: null,
              is_active: true,
            } as any)
            .select("id")
            .single();

          if (insErr) throw insErr;

          trackerInviteId = invRow?.id || null;
          mode = "inserted";
        }

        break;
      } catch (err) {
        if (attempt === 1 && isPgUniqueViolation(err)) continue;
        throw err;
      }
    }

    if (!trackerInviteId) {
      return jsonResponse(500, { ok: false, error: "Failed upserting invite", detail: "No invite id returned", build_tag: BUILD_TAG });
    }

    // ✅ generar magic link con redirect
    const { data: linkData, error: linkErr } = await sbAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo },
    });

    if (linkErr || !linkData?.properties?.action_link) {
      return jsonResponse(500, { ok: false, error: "generateLink failed", detail: linkErr?.message || "no action_link", build_tag: BUILD_TAG });
    }

    const actionLink = linkData.properties.action_link;

    // ✅ enviar correo
    const subject = "Invitación: Tracker GPS - App Geocercas";
    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.4">
        <h2>Invitación a Tracker GPS</h2>
        <p>Has sido invitado a usar el Tracker GPS de <b>App Geocercas</b>.</p>
        <p>Este link te abrirá el Tracker en la organización correcta.</p>
        <p>
          <a href="${actionLink}" style="display:inline-block;padding:12px 16px;background:#10b981;color:#0b1220;text-decoration:none;border-radius:8px;font-weight:700">
            Abrir Tracker GPS
          </a>
        </p>
        <p style="color:#6b7280;font-size:12px">Si no puedes hacer clic, copia y pega este link:</p>
        <p style="word-break:break-all;font-size:12px">${actionLink}</p>
      </div>
    `;

    await brevoSendEmail({
      apiKey: BREVO_API_KEY,
      senderEmail: BREVO_SENDER_EMAIL,
      senderName: BREVO_SENDER_NAME,
      toEmail: email,
      toName: to_name,
      subject,
      html,
      text: `Invitación Tracker GPS: ${actionLink}`,
    });

    return jsonResponse(200, {
      ok: true,
      build_tag: BUILD_TAG,
      mode,
      org_id,
      email,
      tracker_invite_id: trackerInviteId,
      redirect_to: redirectTo,
      action_link: actionLink,
    });
  } catch (e) {
    return jsonResponse(500, { ok: false, error: "Unhandled", detail: String((e as any)?.message || e), build_tag: BUILD_TAG });
  }
});
