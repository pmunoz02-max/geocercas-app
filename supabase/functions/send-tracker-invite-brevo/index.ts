import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const BUILD_TAG = "send-tracker-invite-brevo-2026-04-28-tracker-open-v16-used-at-fix"

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-user-jwt",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

type JsonRecord = Record<string, unknown>

type InviteInsertRow = {
  id: string
  created_at: string
}

function json(status: number, payload: JsonRecord) {
  return new Response(JSON.stringify({ ...payload, build_tag: BUILD_TAG }), {
    status,
    headers: JSON_HEADERS,
  })
}

function normalizeEmail(value: unknown): string {
  return String(value || "").trim().toLowerCase()
}

function getEnv(name: string): string {
  const value = Deno.env.get(name)?.trim()
  if (!value) throw new Error(`missing_env:${name}`)
  return value
}

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "")
}

function getInviteBaseUrl(req: Request, body: JsonRecord | null): {
  baseUrl: string
  source: string
} {
  const bodyBase = String(
    body?.invite_base_url || body?.site_url || body?.redirect_origin || "",
  ).trim()

  if (bodyBase) {
    return { baseUrl: normalizeBaseUrl(bodyBase), source: "request_body" }
  }

  const envBase =
    Deno.env.get("TRACKER_INVITE_BASE_URL")?.trim() ||
    Deno.env.get("APP_SITE_URL")?.trim() ||
    Deno.env.get("PUBLIC_SITE_URL")?.trim() ||
    Deno.env.get("SITE_URL")?.trim() ||
    ""

  if (envBase) {
    return { baseUrl: normalizeBaseUrl(envBase), source: "env" }
  }

  const origin = req.headers.get("origin")?.trim() || ""
  if (origin) {
    return { baseUrl: normalizeBaseUrl(origin), source: "origin_header" }
  }

  throw new Error("missing_env:TRACKER_INVITE_BASE_URL")
}

function extractUserJwt(req: Request): string {
  const explicit = req.headers.get("x-user-jwt")?.trim()
  if (explicit) return explicit

  const auth =
    req.headers.get("authorization") || req.headers.get("Authorization") || ""
  if (auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim()
  }
  return ""
}

function randomTokenHex(bytes = 32): string {
  const values = new Uint8Array(bytes)
  crypto.getRandomValues(values)
  return Array.from(values)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest("SHA-256", data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

async function resolveActingUser(
  supabaseAdmin: ReturnType<typeof createClient>,
  req: Request,
) {
  const userJwt = extractUserJwt(req)
  if (!userJwt) {
    return { user: null, error: "invalid_user_jwt" as const }
  }

  const { data, error } = await supabaseAdmin.auth.getUser(userJwt)
  if (error || !data?.user?.id) {
    console.error("[invite-edge] auth.getUser failed", {
      message: error?.message,
      status: error?.status,
    })
    return { user: null, error: "invalid_user_jwt" as const }
  }

  return { user: data.user, error: null }
}

async function ensureMembership(
  supabaseAdmin: ReturnType<typeof createClient>,
  orgId: string,
  userId: string,
) {
  const lookup = await supabaseAdmin
    .from("org_members")
    .select("org_id,user_id,role")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle()

  if (lookup.error) {
    console.error("[invite-edge] org_members lookup failed", {
      message: lookup.error.message,
      details: lookup.error.details,
      hint: lookup.error.hint,
      code: lookup.error.code,
    })
    return { membership: null, error: "membership_lookup_failed" as const }
  }

  if (!lookup.data) {
    return { membership: null, error: "membership_required" as const }
  }

  return { membership: lookup.data, error: null }
}

async function closeExistingConflictingInvites(
  supabaseAdmin: ReturnType<typeof createClient>,
  orgId: string,
  email: string,
  emailNorm: string,
) {
  const nowIso = new Date().toISOString();

  // Desactivar por email_norm
  const byEmailNorm = await supabaseAdmin
    .from("tracker_invites")
    .update({ is_active: false })
    .eq("org_id", orgId)
    .eq("email", emailNorm)
    .eq("is_active", true);
  if (byEmailNorm.error) {
    console.error("[invite-edge] close invites by emailNorm failed", byEmailNorm.error);
    return { error: "tracker_invite_replace_failed" as const };
  }

  // Desactivar por email_norm
  const byEmailNorm2 = await supabaseAdmin
    .from("tracker_invites")
    .update({ is_active: false })
    .eq("org_id", orgId)
    .eq("email_norm", emailNorm)
    .eq("is_active", true);
  if (byEmailNorm2.error) {
    console.error("[invite-edge] close invites by email_norm failed", byEmailNorm2.error);
    return { error: "tracker_invite_replace_failed" as const };
  }

  return { error: null };
}

async function insertFreshInvite(
  supabaseAdmin: ReturnType<typeof createClient>,
  payload: {
    org_id: string
    email: string
    email_norm: string
    invite_token_hash: string
    expires_at: string
    created_by_user_id: string | null
  },
) {

  // Desactivar invitaciones pendientes (used_at null) por org_id y email (ilike)
  const nowIso = new Date().toISOString();
  await supabaseAdmin
    .from("tracker_invites")
    .update({
      is_active: false,
      used_at: nowIso,
      brevo_last_status: "replaced_by_new_invite",
      brevo_last_event_at: nowIso,
    })
    .eq("org_id", payload.org_id)
    .ilike("email", payload.email)
    .is("used_at", null);

  return await supabaseAdmin
    .from("tracker_invites")
    .insert({
      org_id: payload.org_id,
      email: payload.email_norm,
      email_norm: payload.email_norm,
      invite_token_hash: payload.invite_token_hash,
      created_by_user_id: payload.created_by_user_id,
      expires_at: payload.expires_at,
      is_active: true,
      role: "tracker",
      accepted_at: null,
      used_at: null,
    })
    .select("id, created_at")
    .single<InviteInsertRow>()
}

async function createInviteRow(
  supabaseAdmin: ReturnType<typeof createClient>,
  payload: {
    org_id: string
    email: string
    email_norm: string
    invite_token_hash: string
    expires_at: string
    created_by_user_id: string | null
  },
) {
  // Buscar invitación por org_id + email_norm (activa o no)
  const { data: existing, error: lookupError } = await supabaseAdmin
    .from("tracker_invites")
    .select("id, is_active, used_at, accepted_at, invite_token_hash, expires_at")
    .eq("org_id", payload.org_id)
    .eq("email_norm", payload.email_norm)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lookupError) {
    return { data: null, error: { message: lookupError.message, code: "INVITE_LOOKUP_FAILED" } };
  }

  const nowIso = new Date().toISOString();
  if (existing) {
    if (existing.is_active && !existing.used_at && !existing.accepted_at) {
      // Renovar la invitación pendiente
      const updateRes = await supabaseAdmin
        .from("tracker_invites")
        .update({
          invite_token_hash: payload.invite_token_hash,
          expires_at: payload.expires_at,
          email: payload.email, // usar email original, no solo email_norm
          email_norm: payload.email_norm,
          role: "tracker",
          is_active: true,
          used_at: null,
          accepted_at: null,
          brevo_last_status: "renewed_token",
          brevo_last_event_at: nowIso,
        })
        .eq("id", existing.id)
        .select("id, created_at")
        .maybeSingle();
      if (updateRes.error) {
        return { data: null, error: { message: updateRes.error.message, code: "INVITE_RENEW_FAILED" } };
      }
      return { data: updateRes.data ?? null, error: null };
    }
    if (existing.is_active && (existing.used_at || existing.accepted_at)) {
      // Si la invitación activa ya fue usada o aceptada, desactivar y crear nueva
      let updateFields: Record<string, unknown> = {
        is_active: false,
        brevo_last_status: "deactivated_used_or_accepted",
        brevo_last_event_at: nowIso,
      };
      if (!existing.used_at) {
        updateFields.used_at = nowIso;
      }
      const deactivateRes = await supabaseAdmin
        .from("tracker_invites")
        .update(updateFields)
        .eq("id", existing.id);
      if (deactivateRes.error) {
        return { data: null, error: { message: deactivateRes.error.message, code: "INVITE_DEACTIVATE_FAILED" } };
      }
      // Insertar nueva invitación
      return await insertFreshInvite(supabaseAdmin, payload);
    }
  }

  // Si no hay invitación activa, cerrar posibles conflictos y crear nueva
  const preClose = await closeExistingConflictingInvites(
    supabaseAdmin,
    payload.org_id,
    payload.email,
    payload.email_norm,
  );
  if (preClose.error) {
    return { data: null, error: { message: preClose.error, code: "APP_REPLACE_ACTIVE_INVITE_FAILED" } };
  }
  const insertAttempt = await insertFreshInvite(supabaseAdmin, payload);
  if (insertAttempt.error) {
    return {
      data: null,
      error: {
        message: insertAttempt.error.message,
        details: insertAttempt.error.details,
        hint: insertAttempt.error.hint,
        code: insertAttempt.error.code,
      },
    };
  }
  return { data: insertAttempt.data ?? null, error: null };
}

async function sendViaBrevo(args: {
  brevoApiKey: string
  senderEmail: string
  senderName: string
  toEmail: string
  inviteUrl: string
  orgId: string
  expiresAt: string
}) {
  const endpoint = "https://api.brevo.com/v3/smtp/email"

  const htmlContent = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
      <p>Has sido invitado como tracker en Geocercas.</p>
      <p><strong>Abre este enlace en tu teléfono:</strong></p>
      <p><a href="${args.inviteUrl}">Aceptar invitación</a></p>
      <p style="word-break:break-all">${args.inviteUrl}</p>
      <p>Organización: ${args.orgId}</p>
      <p>Expira: ${args.expiresAt}</p>
    </div>
  `.trim()

  const textContent = [
    "Has sido invitado como tracker en Geocercas.",
    "",
    `Abre este enlace en tu teléfono: ${args.inviteUrl}`,
    "",
    `Organización: ${args.orgId}`,
    `Expira: ${args.expiresAt}`,
  ].join("\n")

  const body = {
    sender: { email: args.senderEmail, name: args.senderName },
    to: [{ email: args.toEmail }],
    subject: "Invitación Tracker - Geocercas",
    headers: { "X-Mailin-track": "0" },
    htmlContent,
    textContent,
  }

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "api-key": args.brevoApiKey,
    },
    body: JSON.stringify(body),
  })

  const text = await res.text()
  let parsed: unknown = null
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    parsed = text || null
  }

  return { ok: res.ok, status: res.status, body: parsed }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: JSON_HEADERS })
  }

  if (req.method !== "POST") {
    return json(405, { ok: false, error: "method_not_allowed" })
  }

  try {
    const supabaseUrl = getEnv("SUPABASE_URL")
    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY")
    const inviteTtlHours = Number(Deno.env.get("TRACKER_INVITE_TTL_HOURS") || "168")

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const body = (await req.json().catch(() => null)) as JsonRecord | null
    const orgId = String(body?.org_id || "").trim()
    const email = String(body?.email || "").trim()
    const emailNorm = normalizeEmail(email)

    if (!orgId || !emailNorm) {
      return json(400, { ok: false, error: "missing_org_id_or_email" })
    }

    const actingUser = await resolveActingUser(supabaseAdmin, req)
    if (actingUser.error || !actingUser.user?.id) {
      return json(401, { ok: false, error: "invalid_user_jwt" })
    }

    const membership = await ensureMembership(supabaseAdmin, orgId, actingUser.user.id)
    if (membership.error) {
      return json(403, { ok: false, error: membership.error })
    }

    const inviteBase = getInviteBaseUrl(req, body)
    const rawToken = randomTokenHex(32)
    const inviteTokenHash = await sha256Hex(rawToken)
    const expiresAt = new Date(Date.now() + inviteTtlHours * 60 * 60 * 1000).toISOString()
    const invitePath = `/tracker-open?token=${encodeURIComponent(rawToken)}&org_id=${encodeURIComponent(orgId)}&userId=${encodeURIComponent(actingUser.user.id)}`
    const inviteUrl = `${inviteBase.baseUrl}${invitePath}`

    const insertResult = await createInviteRow(supabaseAdmin, {
      org_id: orgId,
      email,
      email_norm: emailNorm,
      invite_token_hash: inviteTokenHash,
      expires_at: expiresAt,
      created_by_user_id: actingUser.user.id,
    })

    if (insertResult.error || !insertResult.data) {
      console.error("[invite-edge] tracker invite insert failed", insertResult.error)
      return json(500, {
        ok: false,
        error: "tracker_invite_insert_failed",
        db_error: insertResult.error,
      })
    }

    const brevoApiKey = Deno.env.get("BREVO_API_KEY")?.trim() || ""
    const senderEmail = Deno.env.get("BREVO_SENDER_EMAIL")?.trim() || ""
    const senderName = Deno.env.get("BREVO_SENDER_NAME")?.trim() || "Geocercas"

    let delivery: JsonRecord = { provider: "manual", sent: false, reason: "brevo_not_configured" }

    if (brevoApiKey && senderEmail) {
      const brevo = await sendViaBrevo({
        brevoApiKey,
        senderEmail,
        senderName,
        toEmail: emailNorm,
        inviteUrl,
        orgId,
        expiresAt,
      })

      if (brevo.ok) {
        delivery = { provider: "brevo", sent: true, status: brevo.status, body: brevo.body as JsonRecord }
      } else {
        console.error("[invite-edge] brevo send failed", brevo)
        delivery = { provider: "brevo", sent: false, status: brevo.status, body: brevo.body as JsonRecord }
      }
    }

    return json(200, {
      ok: true,
      invite_id: insertResult.data.id,
      created_at: insertResult.data.created_at,
      invite_url: inviteUrl,
      invite_path: invitePath,
      site_url_used: inviteBase.baseUrl,
      site_url_source: inviteBase.source,
      expires_at: expiresAt,
      delivery,
    })
  } catch (error) {
    console.error("[invite-edge] fatal", error)
    return json(500, {
      ok: false,
      error: "invite_internal_error",
      message: error instanceof Error ? error.message : String(error),
    })
  }
})
