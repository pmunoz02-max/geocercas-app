// NOTE (2026-03-28): Assignment query is now optional and no longer blocks the invite flow.
// If the assignment lookup fails or returns empty, the invite is still sent and a warning is logged.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

console.log("🔥 send-tracker-invite-brevo loaded");

const BUILD_TAG = "send-tracker-invite-brevo-v31_HANDLER_CLEAN_20260329";
const SEND_COOLDOWN_SECONDS = 180;

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, x-api-key, content-type, x-user-jwt, x-app-lang",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

type EmailCopy = {
  subject: string;
  title: string;
  intro1: string;
  intro2: string;
  acceptPrompt: string;
  expires: string;
  cta: string;
  copyLink: string;
  footer1: string;
  footer2: string;
  assignedWindowLabel: string;
  assignedGeofenceLabel: string;
  assignedTaskLabel: string;
  valueNotSpecified: string;
  detailsTitle: string;
};

type AssignmentEmailDetails = {
  found: boolean;
  timeWindow: string;
  geofenceName: string;
  taskName: string;
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

const SUPPORTED_LANGS = new Set(["es", "en", "fr"]);

function sanitizeLang(v: unknown) {
  const raw = String(v ?? "").trim().toLowerCase();
  const two = raw.slice(0, 2);
  return SUPPORTED_LANGS.has(two) ? two : "es";
}

function pickLangFromAcceptLanguage(h: string | null) {
  const s = String(h || "").toLowerCase();
  if (!s) return "";
  const first = s.split(",")[0].trim();
  return first.slice(0, 2);
}

function defaultEmailCopy(lang: string): EmailCopy {
  if (lang === "en") {
    return {
      subject: "Invitation: GPS Tracker – App Geofences",
      title: "Invitation to GPS Tracker",
      intro1: "You have been invited to use the GPS Tracker for App Geofences.",
      intro2: "This link will open the Tracker in the correct organization.",
      acceptPrompt: "To accept this invitation, click the button below and sign in with this email.",
      expires: "This link expires in 7 days.",
      cta: "Open GPS Tracker",
      copyLink: "If you can't click, copy and paste this link:",
      footer1:
        "You received this email because an App Geofences administrator invited you to access the GPS Tracker.",
      footer2:
        "If you weren't expecting this invitation, you can ignore this message or reply to report it.",
      assignedWindowLabel: "Assigned time window",
      assignedGeofenceLabel: "Assigned geofence",
      assignedTaskLabel: "Assigned task",
      valueNotSpecified: "Not specified",
      detailsTitle: "Assignment details",
    };
  }

  if (lang === "fr") {
    return {
      subject: "Invitation : GPS Tracker – App Geocercas",
      title: "Invitation au GPS Tracker",
      intro1: "Vous avez été invité à utiliser le GPS Tracker d’App Geocercas.",
      intro2: "Ce lien ouvrira le Tracker dans la bonne organisation.",
      acceptPrompt:
        "Pour accepter cette invitation, cliquez sur le bouton ci-dessous et connectez-vous avec cet e-mail.",
      expires: "Ce lien expire dans 7 jours.",
      cta: "Ouvrir le GPS Tracker",
      copyLink: "Si vous ne pouvez pas cliquer, copiez et collez ce lien :",
      footer1:
        "Vous recevez cet e-mail car un administrateur App Geocercas vous a invité à accéder au GPS Tracker.",
      footer2:
        "Si vous n’attendiez pas cette invitation, vous pouvez ignorer ce message ou répondre pour le signaler.",
      assignedWindowLabel: "Fenêtre horaire assignée",
      assignedGeofenceLabel: "Géorepère assigné",
      assignedTaskLabel: "Tâche assignée",
      valueNotSpecified: "Non spécifié",
      detailsTitle: "Détails de l’assignation",
    };
  }

  return {
    subject: "Invitación: Tracker GPS – App Geocercas",
    title: "Invitación a Tracker GPS",
    intro1: "Has sido invitado a usar el Tracker GPS de App Geocercas.",
    intro2: "Este enlace abrirá el Tracker en la organización correcta.",
    acceptPrompt:
      "Para aceptar esta invitación, haz clic en el botón de abajo e inicia sesión con este correo.",
    expires: "Este enlace expira en 7 días.",
    cta: "Abrir Tracker GPS",
    copyLink: "Si no puedes hacer clic, copia y pega este enlace:",
    footer1:
      "Recibiste este correo porque un administrador de App Geocercas te invitó a acceder al Tracker GPS.",
    footer2:
      "Si no esperabas esta invitación, puedes ignorar este mensaje o responder a este correo para reportarlo.",
    assignedWindowLabel: "Ventana asignada",
    assignedGeofenceLabel: "Geocerca asignada",
    assignedTaskLabel: "Tarea asignada",
    valueNotSpecified: "No especificada",
    detailsTitle: "Detalle de la asignación",
  };
}

function buildRedirectTo(appPreviewUrl: string, orgId: string, lang: string) {
  const base = appPreviewUrl.replace(/\/$/, "");
  const next = `/tracker-gps?org_id=${encodeURIComponent(orgId)}&lang=${encodeURIComponent(lang)}`;
  return `${base}/auth/callback?lang=${encodeURIComponent(lang)}&next=${encodeURIComponent(next)}`;
}

function escHtml(s: string) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function safeJsonParse(s: string) {
  try {
    return { ok: true as const, json: JSON.parse(s) };
  } catch {
    return { ok: false as const, json: null };
  }
}

function extractBrevoMessageId(raw: string): string {
  const parsed = safeJsonParse(raw);
  const mid = parsed.ok ? (parsed.json?.messageId ?? "") : "";
  if (mid) return String(mid);
  const m = String(raw || "").match(/"messageId"\s*:\s*"([^"]+)"/i);
  return m?.[1] ? String(m[1]) : "";
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
  if (!resp.ok) {
    console.error("[brevo] error", text);
    throw new Error(`Brevo send failed: ${resp.status} ${text}`);
  }

  return text;
}

async function authUserIdFromJwt(params: {
  supabaseUrl: string;
  anonKey: string;
  jwt: string;
}) {
  const url = `${params.supabaseUrl.replace(/\/$/, "")}/auth/v1/user`;

  const r = await fetch(url, {
    method: "GET",
    headers: { apikey: params.anonKey, Authorization: `Bearer ${params.jwt}` },
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
    .select(
      "id, org_id, email, email_norm, is_active, used_at, accepted_at, created_at, expires_at, brevo_sent_at, brevo_message_id, brevo_last_status",
    )
    .eq("org_id", org_id)
    .eq("email_norm", email_norm)
    .or("accepted_at.is.null,used_at.is.null,is_active.eq.true")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

function secondsSince(ts: string | null | undefined) {
  if (!ts) return Number.POSITIVE_INFINITY;
  const ms = Date.parse(ts);
  if (!Number.isFinite(ms)) return Number.POSITIVE_INFINITY;
  return (Date.now() - ms) / 1000;
}

async function updateInviteBrevoState(
  sbAdmin: any,
  inviteId: string,
  patch: Record<string, unknown>,
) {
  const { error } = await sbAdmin
    .from("tracker_invites")
    .update({ ...(patch as any) })
    .eq("id", inviteId);

  if (error) throw error;
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

function firstNonEmpty(...vals: unknown[]) {
  for (const v of vals) {
    const s = String(v ?? "").trim();
    if (s) return s;
  }
  return "";
}

function formatDateTimeForLang(iso: string | null | undefined, lang: string) {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";

  try {
    const locale = lang === "en" ? "en-US" : lang === "fr" ? "fr-FR" : "es-EC";

    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "America/Guayaquil",
    }).format(new Date(ms));
  } catch {
    return iso;
  }
}

function formatTimeWindow(
  startIso: string | null | undefined,
  endIso: string | null | undefined,
  fallback: string,
  lang: string,
) {
  const a = formatDateTimeForLang(startIso, lang);
  const b = formatDateTimeForLang(endIso, lang);
  if (a && b) return `${a} → ${b}`;
  if (a) return a;
  if (b) return b;
  return fallback;
}

async function getAssignmentEmailDetails(
  sbAdmin: any,
  params: {
    assignmentId: string;
    orgId: string;
    fallbackLabel: string;
    lang: string;
  },
): Promise<AssignmentEmailDetails> {
  const { data: asg, error: asgErr } = await sbAdmin
    .from("asignaciones")
    .select(`
      id,
      org_id,
      geofence_id,
      geocerca_id,
      activity_id,
      start_time,
      end_time,
      start_date,
      end_date
    `)
    .eq("id", params.assignmentId)
    .eq("org_id", params.orgId)
    .maybeSingle();

  if (asgErr) throw asgErr;

  if (!asg) {
    return {
      found: false,
      timeWindow: params.fallbackLabel,
      geofenceName: params.fallbackLabel,
      taskName: params.fallbackLabel,
    };
  }

  const geofenceId = firstNonEmpty(asg.geocerca_id, asg.geofence_id);
  let geofenceName = "";
  let taskName = "";

  if (geofenceId && isUuid(geofenceId)) {
    const { data: geo, error: geoErr } = await sbAdmin
      .from("geocercas")
      .select("id, org_id, name, nombre")
      .eq("id", geofenceId)
      .eq("org_id", params.orgId)
      .maybeSingle();

    if (geoErr) throw geoErr;
    geofenceName = firstNonEmpty(geo?.name, geo?.nombre);
  }

  if (asg.activity_id && isUuid(asg.activity_id)) {
    const { data: act, error: actErr } = await sbAdmin
      .from("activities")
      .select("id, tenant_id, org_id, name")
      .eq("id", asg.activity_id)
      .eq("org_id", params.orgId)
      .maybeSingle();

    if (actErr) throw actErr;
    taskName = firstNonEmpty(act?.name);
  }

  const startIso =
    firstNonEmpty(asg.start_time) ||
    (asg.start_date ? `${String(asg.start_date)}T00:00:00-05:00` : "");

  const endIso =
    firstNonEmpty(asg.end_time) ||
    (asg.end_date ? `${String(asg.end_date)}T23:59:59-05:00` : "");

  const timeWindow = formatTimeWindow(
    startIso || null,
    endIso || null,
    params.fallbackLabel,
    params.lang,
  );

  return {
    found: true,
    timeWindow: timeWindow || params.fallbackLabel,
    geofenceName: geofenceName || params.fallbackLabel,
    taskName: taskName || params.fallbackLabel,
  };
}

serve(async (req) => {
  console.log("🔥 handler start", { method: req.method, build_tag: BUILD_TAG });

  try {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
      return jsonResponse(405, {
        ok: false,
        error: "Method not allowed",
        build_tag: BUILD_TAG,
      });
    }

    const t0 = Date.now();

    const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") || "").trim();
    const SUPABASE_SERVICE_ROLE_KEY = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
    const SUPABASE_ANON_KEY = (Deno.env.get("SUPABASE_ANON_KEY") || "").trim();

    const BREVO_API_KEY = (Deno.env.get("BREVO_API_KEY") || "").trim();
    const BREVO_SENDER_EMAIL = (Deno.env.get("BREVO_SENDER_EMAIL") || "").trim();
    const BREVO_SENDER_NAME = (Deno.env.get("BREVO_SENDER_NAME") || "App Geocercas").trim();
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
      return jsonResponse(500, {
        ok: false,
        error: "Missing SUPABASE_ANON_KEY",
        build_tag: BUILD_TAG,
      });
    }

    const userJwt = (req.headers.get("x-user-jwt") || "").trim();
    if (!userJwt) {
      return jsonResponse(401, {
        ok: false,
        error: "Missing x-user-jwt",
        build_tag: BUILD_TAG,
      });
    }

    if (!looksLikeJwt(userJwt)) {
      return jsonResponse(401, {
        ok: false,
        error: "Invalid x-user-jwt format",
        build_tag: BUILD_TAG,
      });
    }

    const sbAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const supabaseAdmin = sbAdmin;

    const u = await authUserIdFromJwt({
      supabaseUrl: SUPABASE_URL,
      anonKey: SUPABASE_ANON_KEY,
      jwt: userJwt,
    });

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
    const assignment_id = String(body?.assignment_id || "").trim();
    const personal_id = String(body?.personal_id || "").trim();

    let lang = "es";
    const bodyLangRaw = body?.lang;
    const headerLangRaw = req.headers.get("x-app-lang");
    const acceptLangRaw = pickLangFromAcceptLanguage(req.headers.get("accept-language"));

    if (bodyLangRaw && String(bodyLangRaw).trim()) lang = sanitizeLang(bodyLangRaw);
    else if (headerLangRaw && String(headerLangRaw).trim()) lang = sanitizeLang(headerLangRaw);
    else if (acceptLangRaw && String(acceptLangRaw).trim()) lang = sanitizeLang(acceptLangRaw);

    const copyFromBody =
      body?.email_copy && typeof body.email_copy === "object" ? body.email_copy : null;
    const copy: EmailCopy = { ...defaultEmailCopy(lang), ...(copyFromBody || {}) };

    if (!isUuid(org_id)) {
      return jsonResponse(400, { ok: false, error: "Invalid org_id", build_tag: BUILD_TAG });
    }

    if (!email || !email.includes("@")) {
      return jsonResponse(400, { ok: false, error: "Invalid email", build_tag: BUILD_TAG });
    }

    if (assignment_id && !isUuid(assignment_id)) {
      return jsonResponse(400, {
        ok: false,
        error: "Invalid assignment_id",
        build_tag: BUILD_TAG,
      });
    }

    const { data: ownerRow, error: ownerErr } = await sbAdmin
      .from("memberships")
      .select("role, revoked_at")
      .eq("org_id", org_id)
      .eq("user_id", callerUserId)
      .is("revoked_at", null)
      .limit(1)
      .maybeSingle();

    if (ownerErr) {
      console.error("[invite] auth_check_failed_db_error", {
        build_tag: BUILD_TAG,
        org_id,
        caller_user_id: callerUserId,
        message: ownerErr.message,
        code: (ownerErr as any).code ?? null,
        details: (ownerErr as any).details ?? null,
      });

      return jsonResponse(500, {
        ok: false,
        error: "DB error checking owner",
        detail: ownerErr.message,
        build_tag: BUILD_TAG,
      });
    }

    const roleNorm = normRole(ownerRow?.role);
    let failureReason: string | null = null;

    if (!ownerRow) {
      failureReason = "NO_MEMBERSHIP_FOUND_FOR_USER_IN_ORG";
    } else if (ownerRow.revoked_at !== null) {
      failureReason = "MEMBERSHIP_REVOKED";
    } else if (roleNorm !== "owner") {
      failureReason = `NOT_OWNER_ROLE_IS_${roleNorm.toUpperCase()}`;
    }

    if (failureReason) {
      return jsonResponse(403, {
        ok: false,
        error: "Not allowed (must be owner of org)",
        build_tag: BUILD_TAG,
        diag: {
          callerUserId,
          org_id,
          role: ownerRow?.role ?? null,
          revoked_at: ownerRow?.revoked_at ?? null,
          reason: failureReason,
        },
      });
    }

    let assignmentDetails: AssignmentEmailDetails = {
      found: false,
      timeWindow: copy.valueNotSpecified,
      geofenceName: copy.valueNotSpecified,
      taskName: copy.valueNotSpecified,
    };

    let effectivePersonalId = personal_id || "";

    if (assignment_id) {
      try {
        const details = await getAssignmentEmailDetails(sbAdmin, {
          assignmentId: assignment_id,
          orgId: org_id,
          fallbackLabel: copy.valueNotSpecified,
          lang,
        });

        assignmentDetails = details;
      } catch (e) {
        console.warn("[send-tracker-invite-brevo] error fetching assignment details", e);
      }
    }

    if (!effectivePersonalId && personal_id) {
      effectivePersonalId = personal_id;
    }

    if (!effectivePersonalId) {
      console.warn("[send-tracker-invite-brevo] No personalId found for invite", {
        org_id,
        email,
        assignment_id,
        personal_id,
      });
    }

    const nowIso = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();

    const redirectTo = buildRedirectTo(APP_PREVIEW_URL, org_id, lang);

    let trackerInviteId: string | null = null;
    let mode: "updated" | "inserted" | "cooldown" | null = null;
    let openInvite: any | null = null;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const open = await findOpenInvite(sbAdmin, org_id, email);
        openInvite = open;

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

    const sentSecondsAgo = secondsSince(openInvite?.brevo_sent_at);
    const cooldownRemaining = Math.max(0, Math.ceil(SEND_COOLDOWN_SECONDS - sentSecondsAgo));
    const withinCooldown = false;
    // SaaS best practice: log warning if within cooldown, but always send email
    if (Number.isFinite(sentSecondsAgo) && sentSecondsAgo < SEND_COOLDOWN_SECONDS) {
      console.log("[invite] cooldown ignored for resend");
    }

    const { data: linkData, error: linkErr } = await sbAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo },
    });


    const tokenHash = String(linkData.properties.hashed_token || "");
    if (!tokenHash) {
      return jsonResponse(500, {
        ok: false,
        error: "generateLink failed",
        detail: "Missing token_hash from Supabase generateLink",
        build_tag: BUILD_TAG,
      });
    }

    const actionLink =
      `${APP_PREVIEW_URL}/auth/callback` +
      `?token_hash=${encodeURIComponent(tokenHash)}` +
      `&type=magiclink` +
      `&lang=${encodeURIComponent(lang)}` +
      `&next=${encodeURIComponent(`/tracker-gps?org_id=${org_id}&lang=${lang}`)}`;

    try {
      console.error("[metrics] invite_sent reached", {
        build_tag: BUILD_TAG,
        org_id,
        callerUserId,
        email,
      });

      await supabaseAdmin.from("org_metrics_events").insert({
        org_id,
        user_id: callerUserId,
        event_type: "invite_sent",
        meta: { email },
      });
    } catch {
      // no bloquear flujo principal
    }

    if (withinCooldown) {
      try {
        await updateInviteBrevoState(sbAdmin, trackerInviteId, {
          brevo_last_status: "cooldown",
          brevo_last_event_at: nowIso,
        });
      } catch (e) {
        console.error("[invite] invite_state_update_failed", {
          build_tag: BUILD_TAG,
          stage: "cooldown",
          tracker_invite_id: trackerInviteId,
          message: String((e as any)?.message || e),
        });
      }

      return jsonResponse(200, {
        ok: true,
        build_tag: BUILD_TAG,
        mode: "cooldown",
        lang,
        org_id,
        email,
        assignment_id: assignment_id || null,
        tracker_invite_id: trackerInviteId,
        redirect_to: redirectTo,
        action_link: actionLink,
        delivery_hint:
          "Email delivery may take a few minutes depending on the provider. Recent invite was already sent.",
        cooldown_seconds: cooldownRemaining,
        assignment_details: assignmentDetails,
      });
    }

    if (!BREVO_API_KEY || !BREVO_SENDER_EMAIL) {
      try {
        await updateInviteBrevoState(sbAdmin, trackerInviteId, {
          brevo_last_status: "disabled",
          brevo_last_event_at: nowIso,
          brevo_last_error: "BREVO_DISABLED_MISSING_ENV",
        });
      } catch (e) {
        console.error("[invite] invite_state_update_failed", {
          build_tag: BUILD_TAG,
          stage: "brevo_disabled",
          tracker_invite_id: trackerInviteId,
          message: String((e as any)?.message || e),
        });
      }

      return jsonResponse(200, {
        ok: true,
        build_tag: BUILD_TAG,
        mode,
        lang,
        org_id,
        email,
        assignment_id: assignment_id || null,
        tracker_invite_id: trackerInviteId,
        redirect_to: redirectTo,
        action_link: actionLink,
        warning: "BREVO_DISABLED_MISSING_ENV",
        assignment_details: assignmentDetails,
        diag: {
          hasBrevoKey: !!BREVO_API_KEY,
          hasSender: !!BREVO_SENDER_EMAIL,
          senderName: BREVO_SENDER_NAME,
        },
      });
    }

    const safeAction = escHtml(actionLink);
    const subject = copy.subject;

    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.55;color:#111827">
        <h2 style="margin:0 0 12px 0">${escHtml(copy.title)}</h2>
        <p style="margin:0 0 10px 0">${escHtml(copy.intro1)}</p>
        <p style="margin:0 0 14px 0">
          ${escHtml(copy.intro2)}<br />
          <span style="color:#6b7280;font-size:12px">${escHtml(copy.expires)}</span>
        </p>

        <p style="margin:0 0 14px 0;font-weight:600">${escHtml(copy.acceptPrompt)}</p>

        <div style="margin:0 0 16px 0;padding:12px 14px;border:1px solid #e5e7eb;border-radius:12px;background:#f8fafc">
          <div style="font-weight:700;margin:0 0 8px 0">${escHtml(copy.detailsTitle)}</div>
          <div style="margin:0 0 6px 0"><b>${escHtml(copy.assignedWindowLabel)}:</b> ${escHtml(assignmentDetails.timeWindow)}</div>
          <div style="margin:0 0 6px 0"><b>${escHtml(copy.assignedGeofenceLabel)}:</b> ${escHtml(assignmentDetails.geofenceName)}</div>
          <div style="margin:0"><b>${escHtml(copy.assignedTaskLabel)}:</b> ${escHtml(assignmentDetails.taskName)}</div>
        </div>

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
      `${copy.acceptPrompt}\n` +
      `${copy.expires}\n\n` +
      `${copy.detailsTitle}\n` +
      `${copy.assignedWindowLabel}: ${assignmentDetails.timeWindow}\n` +
      `${copy.assignedGeofenceLabel}: ${assignmentDetails.geofenceName}\n` +
      `${copy.assignedTaskLabel}: ${assignmentDetails.taskName}\n\n` +
      `${actionLink}\n\n` +
      `${copy.footer2}\n`;

    let brevoResp = "";
    let brevoMessageId = "";

    try {
      brevoResp = await brevoSendEmail({
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

      brevoMessageId = extractBrevoMessageId(brevoResp);

      try {
        await updateInviteBrevoState(sbAdmin, trackerInviteId, {
          brevo_message_id: brevoMessageId || null,
          brevo_sent_at: nowIso,
          brevo_last_status: "sent",
          brevo_last_event_at: nowIso,
          brevo_last_response: String(brevoResp).slice(0, 500),
          brevo_last_error: null,
        });
      } catch (e) {
        console.error("[invite] invite_state_update_failed", {
          build_tag: BUILD_TAG,
          stage: "brevo_sent",
          tracker_invite_id: trackerInviteId,
          message: String((e as any)?.message || e),
        });
      }
    } catch (e) {
      console.error("[invite] brevo_send_error", {
        build_tag: BUILD_TAG,
        tracker_invite_id: trackerInviteId,
        org_id,
        email,
        message: String((e as any)?.message || e),
      });

      try {
        await updateInviteBrevoState(sbAdmin, trackerInviteId, {
          brevo_sent_at: nowIso,
          brevo_last_status: "error",
          brevo_last_event_at: nowIso,
          brevo_last_error: String((e as any)?.message || e).slice(0, 500),
        });
      } catch (e2) {
        console.error("[invite] invite_state_update_failed", {
          build_tag: BUILD_TAG,
          stage: "brevo_send_error",
          tracker_invite_id: trackerInviteId,
          message: String((e2 as any)?.message || e2),
        });
      }

      return jsonResponse(200, {
        ok: true,
        build_tag: BUILD_TAG,
        mode,
        lang,
        org_id,
        email,
        assignment_id: assignment_id || null,
        tracker_invite_id: trackerInviteId,
        redirect_to: redirectTo,
        action_link: actionLink,
        assignment_details: assignmentDetails,
        warning: "BREVO_SEND_FAILED_RETURNING_MANUAL_LINK",
        error: String((e as any)?.message || e),
      });
    }

    return jsonResponse(200, {
      ok: true,
      build_tag: BUILD_TAG,
      mode,
      lang,
      org_id,
      email,
      assignment_id: assignment_id || null,
      tracker_invite_id: trackerInviteId,
      redirect_to: redirectTo,
      action_link: actionLink,
      delivery_hint: "Email delivery may take a few minutes depending on the provider.",
      assignment_details: assignmentDetails,
      brevo: {
        ok: true,
        messageId: brevoMessageId || null,
        sample: String(brevoResp).slice(0, 160),
      },
      elapsed_ms: Date.now() - t0,
    });
  } catch (err: any) {
    console.error("[send-tracker-invite-brevo] UNHANDLED ERROR", err);

    return new Response(
      JSON.stringify({
        ok: false,
        error: "unhandled_exception",
        message: String(err?.message || err),
        build_tag: BUILD_TAG,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});