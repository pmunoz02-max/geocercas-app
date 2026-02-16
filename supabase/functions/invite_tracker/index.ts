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
      "Accept": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await resp.text();
  if (!resp.ok) throw new Error(`Brevo send failed: ${resp.status} ${text}`);
  return text;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse(405, { ok: false, error: "Method not allowed" });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY") || "";
    const BREVO_SENDER_EMAIL = Deno.env.get("BREVO_SENDER_EMAIL") || "";
    const BREVO_SENDER_NAME = Deno.env.get("BREVO_SENDER_NAME") || "App Geocercas";
    const APP_PREVIEW_URL = (Deno.env.get("APP_PREVIEW_URL") || "https://preview.tugeocercas.com").replace(/\/$/, "");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return jsonResponse(500, { ok: false, error: "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" });
    }
    if (!BREVO_API_KEY || !BREVO_SENDER_EMAIL) {
      return jsonResponse(500, { ok: false, error: "Missing BREVO_API_KEY / BREVO_SENDER_EMAIL" });
    }

    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return jsonResponse(401, { ok: false, error: "Missing Bearer token" });
    const jwt = authHeader.slice("Bearer ".length).trim();

    const sbAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // ✅ identificar caller
    const { data: userData, error: userErr } = await sbAdmin.auth.getUser(jwt);
    if (userErr || !userData?.user?.id) {
      return jsonResponse(401, { ok: false, error: "Invalid token", detail: userErr?.message });
    }
    const callerUserId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const org_id = String(body?.org_id || "").trim();
    const email = normEmail(body?.email || "");
    const to_name = String(body?.name || "").trim() || undefined;

    if (!isUuid(org_id)) return jsonResponse(400, { ok: false, error: "Invalid org_id" });
    if (!email || !email.includes("@")) return jsonResponse(400, { ok: false, error: "Invalid email" });

    // ✅ Caller debe ser owner de esa org
    const { data: ownerRow, error: ownerErr } = await sbAdmin
      .from("memberships")
      .select("role, revoked_at")
      .eq("org_id", org_id)
      .eq("user_id", callerUserId)
      .is("revoked_at", null)
      .limit(1)
      .maybeSingle();

    if (ownerErr) return jsonResponse(500, { ok: false, error: "DB error checking owner", detail: ownerErr.message });
    if (!ownerRow || String(ownerRow.role) !== "owner") {
      return jsonResponse(403, { ok: false, error: "Not allowed (must be owner of org)" });
    }

    // 1) Crear/renovar invite en tracker_invites (universal)
    const now = new Date();
    const nowIso = now.toISOString();
    const expiresAt = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 7).toISOString(); // 7 días

    await sbAdmin
      .from("tracker_invites")
      .update({ is_active: false })
      .eq("org_id", org_id)
      .eq("email_norm", email)
      .eq("is_active", true);

    const { data: invRow, error: invInsErr } = await sbAdmin
      .from("tracker_invites")
      .insert({
        org_id,
        email_norm: email,
        created_by_user_id: callerUserId,
        created_at: nowIso,
        expires_at: expiresAt,
        used_at: null,
        used_by_user_id: null,
        is_active: true,
      })
      .select("id")
      .single();

    if (invInsErr) return jsonResponse(500, { ok: false, error: "Failed creating tracker_invite", detail: invInsErr.message });

    // ✅ 2) redirect DIRECTO y robusto (NO callback)
    const redirectTo = `${APP_PREVIEW_URL}/tracker-gps/${encodeURIComponent(org_id)}`;

    const { data: linkData, error: linkErr } = await sbAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo },
    });

    if (linkErr || !linkData?.properties?.action_link) {
      return jsonResponse(500, { ok: false, error: "generateLink failed", detail: linkErr?.message || "no action_link" });
    }

    const actionLink = linkData.properties.action_link;

    // 3) enviar Brevo
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
      toName,
      subject,
      html,
      text: `Invitación Tracker GPS: ${actionLink}`,
    });

    return jsonResponse(200, {
      ok: true,
      org_id,
      email,
      tracker_invite_id: invRow?.id,
      redirect_to: redirectTo,
      action_link_sample: actionLink.slice(0, 120) + "...",
    });
  } catch (e) {
    return jsonResponse(500, { ok: false, error: "Unhandled", detail: String((e as any)?.message || e) });
  }
});
