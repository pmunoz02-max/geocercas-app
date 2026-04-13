import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const BUILD_TAG = "send-tracker-invite-brevo-2026-04-13-active-invite-self-heal-v5"
const JSON_HEADERS = {
  "Content-Type": "application/json",
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

function addHoursIso(base: Date, hours: number): string {
  return new Date(base.getTime() + hours * 60 * 60 * 1000).toISOString()
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest("SHA-256", data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

function extractUserJwt(req: Request): string {
  const explicit = req.headers.get("x-user-jwt")?.trim()
  if (explicit) return explicit

  const auth = req.headers.get("authorization") || req.headers.get("Authorization") || ""
  if (auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim()
  }
  return ""
}

async function resolveActingUser(supabaseAdmin: ReturnType<typeof createClient>, req: Request) {
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
  const firstLookup = await supabaseAdmin
    .from("org_members")
    .select("org_id,user_id,role")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle()

  if (firstLookup.error) {
    console.error("[invite-edge] org_members first lookup failed", {
      message: firstLookup.error.message,
      details: firstLookup.error.details,
      hint: firstLookup.error.hint,
      code: firstLookup.error.code,
    })
  }

  if (firstLookup.data) return { membership: firstLookup.data, error: null }

  const healInsert = await supabaseAdmin.from("org_members").insert({
    org_id: orgId,
    user_id: userId,
    role: "owner",
  })

  if (healInsert.error) {
    console.error("[invite-edge] org_members self-heal insert failed", {
      message: healInsert.error.message,
      details: healInsert.error.details,
      hint: healInsert.error.hint,
      code: healInsert.error.code,
    })
  }

  const retryLookup = await supabaseAdmin
    .from("org_members")
    .select("org_id,user_id,role")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle()

  if (retryLookup.error || !retryLookup.data) {
    console.error("[invite-edge] org_members retry lookup failed", {
      message: retryLookup.error?.message,
      details: retryLookup.error?.details,
      hint: retryLookup.error?.hint,
      code: retryLookup.error?.code,
    })
    return { membership: null, error: "membership_lookup_failed" as const }
  }

  return { membership: retryLookup.data, error: null }
}

async function closeExistingActiveInvites(
  supabaseAdmin: ReturnType<typeof createClient>,
  orgId: string,
  emailNorm: string,
) {
  const { error } = await supabaseAdmin
    .from("tracker_invites")
    .update({
      is_active: false,
    })
    .eq("org_id", orgId)
    .eq("email_norm", emailNorm)
    .eq("is_active", true)

  if (error) {
    console.error("[invite-edge] close active invites failed", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    })
    return { error: "tracker_invite_replace_failed" as const }
  }

  return { error: null }
}

async function insertFreshInvite(
  supabaseAdmin: ReturnType<typeof createClient>,
  payload: {
    org_id: string
    email: string
    email_norm: string
    invite_token_hash: string
    expires_at: string
  },
) {
  const result = await supabaseAdmin
    .from("tracker_invites")
    .insert({
      org_id: payload.org_id,
      email: payload.email,
      email_norm: payload.email_norm,
      invite_token_hash: payload.invite_token_hash,
      is_active: true,
      accepted_at: null,
      used_at: null,
      expires_at: payload.expires_at,
    })
    .select("id, created_at")
    .single<InviteInsertRow>()

  return result
}

async function createInviteRow(
  supabaseAdmin: ReturnType<typeof createClient>,
  payload: {
    org_id: string
    email: string
    email_norm: string
    invite_token_hash: string
    expires_at: string
  },
) {
  let insertAttempt = await insertFreshInvite(supabaseAdmin, payload)

  if (insertAttempt.error?.code === "23505") {
    const closeAttempt = await closeExistingActiveInvites(
      supabaseAdmin,
      payload.org_id,
      payload.email_norm,
    )

    if (closeAttempt.error) {
      return {
        data: null,
        error: {
          message: closeAttempt.error,
          details: null,
          hint: null,
          code: "APP_REPLACE_ACTIVE_INVITE_FAILED",
        },
      }
    }

    insertAttempt = await insertFreshInvite(supabaseAdmin, payload)
  }

  return insertAttempt
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
  const body = {
    sender: {
      email: args.senderEmail,
      name: args.senderName,
    },
    to: [{ email: args.toEmail }],
    subject: "Tracker invitation",
    htmlContent: `
      <p>You have been invited to join an organization as a tracker.</p>
      <p><a href="${args.inviteUrl}">Accept invitation</a></p>
      <p>Organization: ${args.orgId}</p>
      <p>Expires at: ${args.expiresAt}</p>
    `,
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

  return {
    ok: res.ok,
    status: res.status,
    body: parsed,
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        ...JSON_HEADERS,
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-user-jwt",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    })
  }

  if (req.method !== "POST") {
    return json(405, { ok: false, error: "method_not_allowed" })
  }

  try {
    const supabaseUrl = getEnv("SUPABASE_URL")
    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY")
    const siteUrl = Deno.env.get("PUBLIC_SITE_URL")?.trim() || Deno.env.get("SITE_URL")?.trim() || ""
    const inviteTtlHours = Number(Deno.env.get("TRACKER_INVITE_TTL_HOURS") || "168")

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const body = await req.json().catch(() => null)
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
      return json(500, { ok: false, error: membership.error })
    }

    const inviteToken = crypto.randomUUID()
    const inviteTokenHash = await sha256Hex(inviteToken)
    const expiresAt = addHoursIso(new Date(), Number.isFinite(inviteTtlHours) ? inviteTtlHours : 168)

    const insertResult = await createInviteRow(supabaseAdmin, {
      org_id: orgId,
      email,
      email_norm: emailNorm,
      invite_token_hash: inviteTokenHash,
      expires_at: expiresAt,
    })

    if (insertResult.error || !insertResult.data?.id || !insertResult.data?.created_at) {
      console.error("[invite-edge] insert error full", {
        message: insertResult.error?.message,
        details: insertResult.error?.details,
        hint: insertResult.error?.hint,
        code: insertResult.error?.code,
      })
      return json(500, {
        ok: false,
        error: "tracker_invite_insert_failed",
        debug: {
          message: insertResult.error?.message || "unknown_insert_error",
          details: insertResult.error?.details || null,
          hint: insertResult.error?.hint || null,
          code: insertResult.error?.code || null,
        },
      })
    }

    const inviteUrl = siteUrl
      ? `${siteUrl.replace(/\/$/, "")}/tracker/accept-invite?token=${encodeURIComponent(inviteToken)}`
      : `tracker/accept-invite?token=${encodeURIComponent(inviteToken)}`

    const brevoApiKey = Deno.env.get("BREVO_API_KEY")?.trim() || ""
    const senderEmail = Deno.env.get("BREVO_SENDER_EMAIL")?.trim() || ""
    const senderName = Deno.env.get("BREVO_SENDER_NAME")?.trim() || "Geocercas"

    let delivery: JsonRecord = {
      provider: "manual",
      sent: false,
      reason: "brevo_not_configured",
    }

    if (brevoApiKey && senderEmail) {
      const brevo = await sendViaBrevo({
        brevoApiKey,
        senderEmail,
        senderName,
        toEmail: email,
        inviteUrl,
        orgId,
        expiresAt,
      })

      if (brevo.ok) {
        delivery = {
          provider: "brevo",
          sent: true,
          status: brevo.status,
        }
      } else {
        console.error("[invite-edge] brevo send failed", brevo)
        delivery = {
          provider: "brevo",
          sent: false,
          status: brevo.status,
          body: brevo.body,
        }
      }
    }

    return json(200, {
      ok: true,
      invite_id: insertResult.data.id,
      created_at: insertResult.data.created_at,
      invite_url: inviteUrl,
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
