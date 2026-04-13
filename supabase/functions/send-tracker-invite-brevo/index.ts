import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

console.log("🔥 send-tracker-invite-brevo loaded");

const BUILD_TAG = "send-tracker-invite-brevo-2026-04-13-return-invite-row-v1";
const DEFAULT_INVITE_TTL_HOURS = 24 * 7;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-user-jwt",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type InviteRequestBody = {
  org_id?: string;
  email?: string;
  name?: string;
  personal_id?: string | null;
  assignment_id?: string | null;
};

type JsonRecord = Record<string, unknown>;

function jsonResponse(body: JsonRecord, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function getEnv(name: string, fallback?: string): string {
  const value = Deno.env.get(name) ?? fallback;
  if (!value) {
    throw new Error(`missing_env_${name}`);
  }
  return value;
}

function normalizeEmail(value: string | undefined | null): string {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeOptionalString(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? text : null;
}

function getJwtFromRequest(req: Request): string | null {
  const xUserJwt = req.headers.get("x-user-jwt")?.trim();
  if (xUserJwt) return xUserJwt;

  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!authHeader) return null;

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function buildInviteTokenPlain(): string {
  return `${crypto.randomUUID()}.${crypto.randomUUID()}.${Date.now()}`;
}

function buildInviteUrl(appBaseUrl: string, inviteTokenPlain: string, orgId: string): string {
  const url = new URL("/tracker-accept", appBaseUrl);
  url.searchParams.set("t", inviteTokenPlain);
  url.searchParams.set("org_id", orgId);
  return url.toString();
}

function getAppBaseUrl(): string {
  const raw = Deno.env.get("APP_BASE_URL")
    ?? Deno.env.get("PUBLIC_APP_URL")
    ?? Deno.env.get("SITE_URL")
    ?? "https://app.tugeocercas.com";

  return raw.replace(/\/$/, "");
}

async function sendBrevoEmail(args: {
  apiKey: string;
  email: string;
  name: string | null;
  inviteUrl: string;
  senderEmail: string;
  senderName: string;
  orgId: string;
}): Promise<{ ok: boolean; status?: number; bodyText?: string }> {
  const recipientName = args.name?.trim() || "";
  const subject = "Invitación para tracker";
  const textContent = [
    recipientName ? `Hola ${recipientName},` : "Hola,",
    "",
    "Has recibido una invitación para acceder como tracker.",
    "Abre este enlace desde tu teléfono para aceptar la invitación:",
    args.inviteUrl,
    "",
    `Organización: ${args.orgId}`,
  ].join("\n");

  const htmlContent = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111">
      <p>${recipientName ? `Hola ${recipientName},` : "Hola,"}</p>
      <p>Has recibido una invitación para acceder como <strong>tracker</strong>.</p>
      <p>
        <a href="${args.inviteUrl}" style="display:inline-block;padding:12px 18px;border-radius:8px;text-decoration:none;border:1px solid #111;color:#111">
          Aceptar invitación
        </a>
      </p>
      <p>Si el botón no funciona, abre este enlace:</p>
      <p><a href="${args.inviteUrl}">${args.inviteUrl}</a></p>
      <p>Organización: ${args.orgId}</p>
    </div>
  `;

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "accept": "application/json",
      "content-type": "application/json",
      "api-key": args.apiKey,
    },
    body: JSON.stringify({
      sender: {
        email: args.senderEmail,
        name: args.senderName,
      },
      to: [
        {
          email: args.email,
          ...(recipientName ? { name: recipientName } : {}),
        },
      ],
      subject,
      htmlContent,
      textContent,
    }),
  });

  const bodyText = await response.text();

  return {
    ok: response.ok,
    status: response.status,
    bodyText,
  };
}

serve(async (req: Request) => {
  console.log("🔥 handler start", BUILD_TAG, req.method, req.url);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "method_not_allowed", build_tag: BUILD_TAG }, 405);
  }

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = getEnv("SUPABASE_ANON_KEY");
    const appBaseUrl = getAppBaseUrl();
    const brevoApiKey = Deno.env.get("BREVO_API_KEY")?.trim() || "";
    const brevoSenderEmail = Deno.env.get("BREVO_SENDER_EMAIL")?.trim() || "noreply@app.tugeocercas.com";
    const brevoSenderName = Deno.env.get("BREVO_SENDER_NAME")?.trim() || "Geocercas";

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const userJwt = getJwtFromRequest(req);
    if (!userJwt) {
      return jsonResponse({ ok: false, error: "missing_user_jwt", build_tag: BUILD_TAG }, 401);
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${userJwt}`,
        },
      },
    });

    const { data: authData, error: authError } = await authClient.auth.getUser();
    if (authError || !authData.user?.id) {
      console.error("[invite-edge] auth getUser failed", authError);
      return jsonResponse({ ok: false, error: "invalid_user_jwt", build_tag: BUILD_TAG }, 401);
    }

    const requesterUserId = authData.user.id;

    let body: InviteRequestBody;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ ok: false, error: "invalid_json_body", build_tag: BUILD_TAG }, 400);
    }

    const orgId = normalizeOptionalString(body.org_id);
    const email = normalizeEmail(body.email);
    const name = normalizeOptionalString(body.name);
    const personalId = normalizeOptionalString(body.personal_id);
    const assignmentId = normalizeOptionalString(body.assignment_id);

    if (!orgId) {
      return jsonResponse({ ok: false, error: "missing_org_id", build_tag: BUILD_TAG }, 400);
    }

    if (!email) {
      return jsonResponse({ ok: false, error: "missing_email", build_tag: BUILD_TAG }, 400);
    }

    const { data: membership, error: membershipError } = await supabaseAdmin
      .from("org_members")
      .select("org_id, user_id, role, active")
      .eq("org_id", orgId)
      .eq("user_id", requesterUserId)
      .eq("active", true)
      .in("role", ["owner", "admin"])
      .maybeSingle();

    if (membershipError) {
      console.error("[invite-edge] membership lookup failed", membershipError);
      return jsonResponse({ ok: false, error: "membership_lookup_failed", build_tag: BUILD_TAG }, 500);
    }

    if (!membership) {
      return jsonResponse({ ok: false, error: "forbidden_org_membership", build_tag: BUILD_TAG }, 403);
    }

    let personalRow: { id: string; email: string | null; org_id: string; user_id?: string | null } | null = null;

    if (personalId) {
      const { data, error } = await supabaseAdmin
        .from("personal")
        .select("id, email, org_id, user_id")
        .eq("id", personalId)
        .eq("org_id", orgId)
        .maybeSingle();

      if (error) {
        console.error("[invite-edge] personal lookup by id failed", error);
        return jsonResponse({ ok: false, error: "personal_lookup_failed", build_tag: BUILD_TAG }, 500);
      }

      personalRow = data;
    }

    if (!personalRow) {
      const { data, error } = await supabaseAdmin
        .from("personal")
        .select("id, email, org_id, user_id")
        .eq("org_id", orgId)
        .ilike("email", email)
        .maybeSingle();

      if (error) {
        console.error("[invite-edge] personal lookup by email failed", error);
        return jsonResponse({ ok: false, error: "personal_lookup_failed", build_tag: BUILD_TAG }, 500);
      }

      personalRow = data;
    }

    if (!personalRow?.id) {
      return jsonResponse({ ok: false, error: "personal_not_found_for_invite", build_tag: BUILD_TAG }, 400);
    }

    const inviteTokenPlain = buildInviteTokenPlain();
    const inviteTokenHash = await sha256Hex(inviteTokenPlain);
    const inviteUrl = buildInviteUrl(appBaseUrl, inviteTokenPlain, orgId);
    const expiresAt = new Date(Date.now() + DEFAULT_INVITE_TTL_HOURS * 60 * 60 * 1000).toISOString();

    const insertPayload: Record<string, unknown> = {
      org_id: orgId,
      email,
      personal_id: personalRow.id,
      invite_token_hash: inviteTokenHash,
      is_active: true,
      accepted_at: null,
      used_at: null,
      used_by_user_id: null,
      expires_at: expiresAt,
    };

    if (assignmentId) {
      insertPayload.assignment_id = assignmentId;
    }

    const { data: inviteRow, error: inviteInsertError } = await supabaseAdmin
      .from("tracker_invites")
      .insert(insertPayload)
      .select("id, created_at")
      .single();

    if (inviteInsertError || !inviteRow?.id || !inviteRow?.created_at) {
      console.error("[invite-edge] failed insert tracker_invites", inviteInsertError);
      return jsonResponse(
        {
          ok: false,
          error: "tracker_invite_insert_failed",
          build_tag: BUILD_TAG,
        },
        500,
      );
    }

    if (!inviteUrl) {
      return jsonResponse(
        {
          ok: false,
          error: "invite_url_not_built",
          build_tag: BUILD_TAG,
        },
        500,
      );
    }

    if (!brevoApiKey) {
      console.warn("[invite-edge] BREVO_API_KEY missing; returning manual action link");
      return jsonResponse({
        ok: true,
        invite_id: inviteRow.id,
        created_at: inviteRow.created_at,
        invite_url: inviteUrl,
        action_link: inviteUrl,
        email_sent: false,
        email_provider: "none",
        warning: "brevo_api_key_missing",
        build_tag: BUILD_TAG,
      });
    }

    const brevoResult = await sendBrevoEmail({
      apiKey: brevoApiKey,
      email,
      name,
      inviteUrl,
      senderEmail: brevoSenderEmail,
      senderName: brevoSenderName,
      orgId,
    });

    if (!brevoResult.ok) {
      console.error("[invite-edge] brevo send failed", {
        status: brevoResult.status,
        bodyText: brevoResult.bodyText,
      });

      return jsonResponse({
        ok: true,
        invite_id: inviteRow.id,
        created_at: inviteRow.created_at,
        invite_url: inviteUrl,
        action_link: inviteUrl,
        email_sent: false,
        email_provider: "brevo",
        brevo_status: brevoResult.status ?? null,
        warning: "brevo_send_failed",
        build_tag: BUILD_TAG,
      });
    }

    return jsonResponse({
      ok: true,
      invite_id: inviteRow.id,
      created_at: inviteRow.created_at,
      invite_url: inviteUrl,
      action_link: inviteUrl,
      email_sent: true,
      email_provider: "brevo",
      build_tag: BUILD_TAG,
    });
  } catch (error) {
    console.error("[invite-edge] unhandled", error);
    return jsonResponse(
      {
        ok: false,
        error: "internal_error",
        detail: error instanceof Error ? error.message : String(error),
        build_tag: BUILD_TAG,
      },
      500,
    );
  }
});
