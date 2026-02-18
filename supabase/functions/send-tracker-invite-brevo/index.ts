import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const BUILD_TAG = "send-tracker-invite-brevo-auth-subdomain-20260218_LANG_I18N_EMAIL_FIX";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, x-api-key, content-type, x-user-jwt, x-app-lang",
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
  return s.split(".").length === 3;
}

function normRole(role: unknown) {
  return String(role ?? "").trim().toLowerCase();
}

// ---------- i18n helpers (email + redirect) ----------
const SUPPORTED_LANGS = new Set(["es", "en", "fr"]);

function sanitizeLang(v: unknown) {
  const raw = String(v ?? "").trim().toLowerCase();
  const two = raw.slice(0, 2);
  return SUPPORTED_LANGS.has(two) ? two : "es";
}

function pickLangFromAcceptLanguage(h: string | null) {
  const s = String(h || "").toLowerCase();
  if (!s) return "";
  const first = s.split(",")[0].trim(); // "fr-ca"
  return first.slice(0, 2);
}

type EmailCopy = {
  subject: string;
  title: string;
  intro1: string;
  intro2: string;
  expires: string;
  cta: string;
  copyLink: string;
  footer1: string;
  footer2: string;
};

function defaultEmailCopy(lang: string): EmailCopy {
  if (lang === "en") {
    return {
      subject: "Invitation: GPS Tracker – App Geofences",
      title: "Invitation to GPS Tracker",
      intro1: "You have been invited to use the GPS Tracker for App Geofences.",
      intro2: "This link will open the Tracker in the correct organization.",
      expires: "This link expires in 7 days.",
      cta: "Open GPS Tracker",
      copyLink: "If you can't click, copy and paste this link:",
      footer1:
        "You received this email because an App Geofences administrator invited you to access the GPS Tracker.",
      footer2:
        "If you weren't expecting this invitation, you can ignore this message or reply to report it.",
    };
  }
  if (lang === "fr") {
    return {
      subject: "Invitation : GPS Tracker – App Geocercas",
      title: "Invitation au GPS Tracker",
      intro1: "Vous avez été invité à utiliser le GPS Tracker d’App Geocercas.",
      intro2: "Ce lien ouvrira le Tracker dans la bonne organisation.",
      expires: "Ce lien expire dans 7 jours.",
      cta: "Ouvrir le GPS Tracker",
      copyLink: "Si vous ne pouvez pas cliquer, copiez et collez ce lien :",
      footer1:
        "Vous recevez cet e-mail car un administrateur App Geocercas vous a invité à accéder au GPS Tracker.",
      footer2:
        "Si vous n’attendiez pas cette invitation, vous pouvez ignorer ce message ou répondre pour le signaler.",
    };
  }
  // es default
  return {
    subject: "Invitación: Tracker GPS – App Geocercas",
    title: "Invitación a Tracker GPS",
    intro1: "Has sido invitado a usar el Tracker GPS de App Geocercas.",
    intro2: "Este enlace abrirá el Tracker en la organización correcta.",
    expires: "Este enlace expira en 7 días.",
    cta: "Abrir Tracker GPS",
    copyLink: "Si no puedes hacer clic, copia y pega este enlace:",
    footer1:
      "Recibiste este correo porque un administrador de App Geocercas te invitó a acceder al Tracker GPS.",
    footer2:
      "Si no esperabas esta invitación, puedes ignorar este mensaje o responder a este correo para reportarlo.",
  };
}

// ✅ CANÓNICO: callback existente + preserva idioma
function buildRedirectTo(appPreviewUrl: string, orgId: string, lang: string) {
  const base = appPreviewUrl.replace(/\/$/, "");
  // preserva lang también dentro de next para que la app continúe en ese idioma
  const next = `/tracker-gps?org_id=${encodeURIComponent(orgId)}&lang=${encodeURIComponent(lang)}`;
  return `${base}/auth/callback?lang=${encodeURIComponent(lang)}&next=${encodeURIComponent(next)}`;
}

// escape simple para HTML
function escHtml(s: string) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
  replyToEmail?: string;
  replyToName?: string;
}) {
  const payload: any = {
    sender: { email: opts.senderEmail, name: opts.senderName },
    to: [{ email: opts.toEmail, name: opts.toName || opts.toEmail }],
    subject: opts.subject,
    htmlContent: opts.html,
    textContent: opts.text || undefined,
  };

  if (opts.replyToEmail) {
    payload.replyTo = {
      email: opts.replyToEmail,
      name: opts.replyToName || opts.replyToEmail,
    };
  }

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
 * NOTA: aquí jwt es el x-user-jwt (NO Authorization de gateway)
 */
async function authUserIdFromJwt(params: {
  supabaseUrl: string;
  anonKey: string;
  jwt: string;
}) {
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

async function deactivateOtherActives(
  sbAdmin: any,
  org_id: string,
  email_norm: string,
  keepId: string,
) {
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
  if (req.method !== "POST") {
    return jsonResponse(405, { ok: false, error: "Method not allowed", build_tag: BUILD_TAG });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";

    const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY") || "";
    const BREVO_SENDER_EMAIL = Deno.env.get("BREVO_SENDER_EMAIL") || "";
    const BREVO_SENDER_NAME = Deno.env.get("BREVO_SENDER_NAME") || "App Geocercas";
    const BREVO_REPLYTO_EMAIL = (Deno.env.get("BREVO_REPLYTO_EMAIL") || "").trim();

    const APP_PREVIEW_URL = (Deno.env.get("APP_PREVIEW_URL") || "https://preview.tugeocercas.com")
      .replace(/\/$/, "");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return jsonResponse(500, {
        ok: false,
        error: "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY",
        build_tag: BUILD_TAG,
      });
    }
    if (!SUPABASE_ANON_KEY) {
      return jsonResponse(500, { ok: false, error: "Missing SUPABASE_ANON_KEY", build_tag: BUILD_TAG });
    }
    if (!BREVO_API_KEY || !BREVO_SENDER_EMAIL) {
      return jsonResponse(500, {
        ok: false,
        error: "Missing BREVO_API_KEY / BREVO_SENDER_EMAIL",
        build_tag: BUILD_TAG,
      });
    }

    // ✅ 100% x-user-jwt
    const userJwt = (req.headers.get("x-user-jwt") || "").trim();
    if (!userJwt) return jsonResponse(401, { ok: false, error: "Missing x-user-jwt", build_tag: BUILD_TAG });
    if (!looksLikeJwt(userJwt)) {
      return jsonResponse(401, { ok: false, error: "Invalid x-user-jwt format", build_tag: BUILD_TAG });
    }

    const sbAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // ✅ validar caller
    const u = await authUserIdFromJwt({ supabaseUrl: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY, jwt: userJwt });
    if (!u.ok) {
      return jsonResponse(401, {
        ok: false,
        error: "Invalid JWT",
        detail: u.body,
        status: u.status,
        build_tag: BUILD_TAG,
      });
    }
    const callerUserId = u.user_id;

    const body = await req.json().catch(() => ({} as any));
    const org_id = String(body?.org_id || "").trim();
    const email = normEmail(body?.email || "");
    const to_name = String(body?.name || "").trim() || undefined;

    // ✅ idioma: body.lang -> header x-app-lang -> Accept-Language -> es
    const lang =
      sanitizeLang(body?.lang) ||
      sanitizeLang(req.headers.get("x-app-lang")) ||
      sanitizeLang(pickLangFromAcceptLanguage(req.headers.get("accept-language"))) ||
      "es";

    // ✅ copy: si viene desde el proxy, úsalo; si no, default
    const copyFromBody = body?.email_copy && typeof body.email_copy === "object" ? body.email_copy : null;
    const copy: EmailCopy = {
      ...defaultEmailCopy(lang),
      ...(copyFromBody || {}),
    };

    if (!isUuid(org_id)) return jsonResponse(400, { ok: false, error: "Invalid org_id", build_tag: BUILD_TAG });
    if (!email || !email.includes("@")) return jsonResponse(400, { ok: false, error: "Invalid email", build_tag: BUILD_TAG });

    // ✅ Caller debe ser owner de esa org (ROLE NORMALIZED)
    const { data: ownerRow, error: ownerErr } = await sbAdmin
      .from("memberships")
      .select("role, revoked_at")
      .eq("org_id", org_id)
      .eq("user_id", callerUserId)
      .is("revoked_at", null)
      .limit(1)
      .maybeSingle();

    if (ownerErr) {
      return jsonResponse(500, {
        ok: false,
        error: "DB error checking owner",
        detail: ownerErr.message,
        build_tag: BUILD_TAG,
      });
    }

    const roleNorm = normRole(ownerRow?.role);
    if (!ownerRow || roleNorm !== "owner") {
      return jsonResponse(403, {
        ok: false,
        error: "Not allowed (must be owner of org)",
        build_tag: BUILD_TAG,
        diag: {
          callerUserId,
          org_id,
          role_raw: ownerRow?.role ?? null,
          role_norm: roleNorm || null,
          revoked_at: ownerRow?.revoked_at ?? null,
        },
      });
    }

    const nowIso = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();

    // ✅ redirect preserva lang
    const redirectTo = buildRedirectTo(APP_PREVIEW_URL, org_id, lang);

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
      return jsonResponse(500, {
        ok: false,
        error: "Failed upserting invite",
        detail: "No invite id returned",
        build_tag: BUILD_TAG,
      });
    }

    // ✅ generar magic link con redirect
    const { data: linkData, error: linkErr } = await sbAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo },
    });

    if (linkErr || !linkData?.properties?.action_link) {
      return jsonResponse(500, {
        ok: false,
        error: "generateLink failed",
        detail: linkErr?.message || "no action_link",
        build_tag: BUILD_TAG,
      });
    }

    const actionLink = String(linkData.properties.action_link);
    const safeAction = escHtml(actionLink);

    // ✅ email traducido
    const subject = copy.subject;

    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.55;color:#111827">
        <h2 style="margin:0 0 12px 0">${escHtml(copy.title)}</h2>
        <p style="margin:0 0 10px 0">${escHtml(copy.intro1)}</p>
        <p style="margin:0 0 14px 0">
          ${escHtml(copy.intro2)}<br />
          <span style="color:#6b7280;font-size:12px">${escHtml(copy.expires)}</span>
        </p>
        <p style="margin:0 0 16px 0">
          <a href="${safeAction}"
             style="display:inline-block;padding:12px 16px;background:#10b981;color:#0b1220;text-decoration:none;border-radius:10px;font-weight:700">
            ${escHtml(copy.cta)}
          </a>
        </p>
        <p style="color:#6b7280;font-size:12px;margin:0 0 6px 0">${escHtml(copy.copyLink)}</p>
        <p style="word-break:break-all;font-size:12px;margin:0 0 16px 0">${safeAction}</p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:18px 0" />
        <p style="color:#6b7280;font-size:12px;margin:0 0 6px 0">${escHtml(copy.footer1)}</p>
        <p style="color:#6b7280;font-size:12px;margin:0">${escHtml(copy.footer2)}</p>
      </div>
    `;

    const text =
      `${copy.title}\n\n` +
      `${copy.intro1}\n` +
      `${copy.intro2}\n` +
      `${copy.expires}\n\n` +
      `${actionLink}\n\n` +
      `${copy.footer2}\n`;

    await brevoSendEmail({
      apiKey: BREVO_API_KEY,
      senderEmail: BREVO_SENDER_EMAIL,
      senderName: BREVO_SENDER_NAME,
      toEmail: email,
      toName: to_name,
      subject,
      html,
      text,
      replyToEmail: BREVO_REPLYTO_EMAIL || BREVO_SENDER_EMAIL,
      replyToName: BREVO_SENDER_NAME,
    });

    return jsonResponse(200, {
      ok: true,
      build_tag: BUILD_TAG,
      mode,
      lang,
      org_id,
      email,
      tracker_invite_id: trackerInviteId,
      redirect_to: redirectTo,
      action_link: actionLink,
    });
  } catch (e) {
    return jsonResponse(500, {
      ok: false,
      error: "Unhandled",
      detail: String((e as any)?.message || e),
      build_tag: BUILD_TAG,
    });
  }
});
