
// supabase/functions/invite_tracker/index.ts

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BUILD_TAG = "invite-edge-v4_i18n_preview_20260222";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const HMAC_SECRET = Deno.env.get("INVITE_HMAC_SECRET")!;
const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY")!;
const BREVO_SENDER_EMAIL = Deno.env.get("BREVO_SENDER_EMAIL")!;
const BREVO_SENDER_NAME = Deno.env.get("BREVO_SENDER_NAME")!;

const SUPPORTED = ["es","en","fr"];

function pickLang(v?: string) {
  const l = String(v || "").toLowerCase().slice(0,2);
  return SUPPORTED.includes(l) ? l : "es";
}

const I18N = {
  es: {
    subject: "Invitación a Tracker GPS",
    title: "Invitación a Tracker GPS",
    intro: "Has sido invitado a usar el Tracker GPS de App Geocercas.",
    hint: "Este enlace abrirá el Tracker en la organización correcta.",
    cta: "Aceptar invitación",
    greeting: "Hola",
  },
  en: {
    subject: "GPS Tracker Invitation",
    title: "GPS Tracker Invitation",
    intro: "You have been invited to use the GPS Tracker for App Geocercas.",
    hint: "This link will open the Tracker in the correct organization.",
    cta: "Accept invitation",
    greeting: "Hello",
  },
  fr: {
    subject: "Invitation au Traceur GPS",
    title: "Invitation au Traceur GPS",
    intro: "Vous avez été invité à utiliser le Traceur GPS de App Geocercas.",
    hint: "Ce lien ouvrira le Traceur dans la bonne organisation.",
    cta: "Accepter l'invitation",
    greeting: "Bonjour",
  }
};

function json(status: number, body: any) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function verifyHmac(req: Request, body: any) {
  const ts = req.headers.get("x-edge-ts");
  const sig = req.headers.get("x-edge-sig");

  if (!ts || !sig) return false;

  const msg = `${ts}\n${body.org_id}\n${body.email}`;
  const enc = new TextEncoder();

  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(HMAC_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(msg));

  const expected = Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");

  return expected === sig;
}

serve(async (req: Request) => {
  try {

    if (req.method !== "POST") {
      return json(405, { ok: false, error: "METHOD_NOT_ALLOWED", build_tag: BUILD_TAG });
    }

    const body = await req.json().catch(() => null);
    if (!body) {
      return json(400, { ok: false, error: "INVALID_JSON", build_tag: BUILD_TAG });
    }

    const { org_id, email, name, caller_jwt, lang } = body;

    if (!org_id || !email || !caller_jwt) {
      return json(400, { ok: false, error: "MISSING_FIELDS", build_tag: BUILD_TAG });
    }

    const hmacOk = await verifyHmac(req, body);
    if (!hmacOk) {
      return json(401, { ok: false, error: "INVALID_HMAC", build_tag: BUILD_TAG });
    }

    const langFinal = pickLang(lang);
    const T = I18N[langFinal];

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: userData, error: userError } =
      await supabase.auth.getUser(caller_jwt);

    if (userError || !userData?.user) {
      return json(401, { ok: false, error: "INVALID_CALLER", build_tag: BUILD_TAG });
    }

    const callerId = userData.user.id;

    const { data: member } = await supabase
      .from("org_members")
      .select("role")
      .eq("org_id", org_id)
      .eq("user_id", callerId)
      .single();

    if (!member || (member.role !== "admin" && member.role !== "owner")) {
      return json(403, { ok: false, error: "NOT_ORG_ADMIN", build_tag: BUILD_TAG });
    }

    const emailNorm = email.trim().toLowerCase();

    const { data: existingInvite } = await supabase
      .from("tracker_invites")
      .select("*")
      .eq("org_id", org_id)
      .eq("email_norm", emailNorm)
      .eq("is_active", true)
      .is("used_at", null)
      .maybeSingle();

    let invite = existingInvite;

    if (!invite) {
      const { data: newInvite, error: inviteError } =
        await supabase
          .from("tracker_invites")
          .insert({
            org_id,
            email_norm: emailNorm,
            email,
            created_by_user_id: callerId,
            expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000),
            is_active: true,
            role: "tracker",
          })
          .select()
          .single();

      if (inviteError || !newInvite) {
        return json(500, {
          ok: false,
          error: "INVITE_INSERT_FAILED",
          detail: inviteError?.message,
          build_tag: BUILD_TAG,
        });
      }

      invite = newInvite;
    } else {
      await supabase
        .from("tracker_invites")
        .update({
          expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000),
        })
        .eq("id", invite.id);
    }

    const acceptUrl =
      `https://preview.tugeocercas.com/tracker-accept?invite_id=${invite.id}&org_id=${org_id}&lang=${langFinal}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": BREVO_API_KEY,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sender: {
            email: BREVO_SENDER_EMAIL,
            name: BREVO_SENDER_NAME,
          },
          to: [{ email }],
          subject: T.subject,
          htmlContent: `
            <h2>${T.title}</h2>
            <p>${T.greeting} ${name || ""},</p>
            <p>${T.intro}</p>
            <p>${T.hint}</p>
            <p>
              <a href="${acceptUrl}" style="display:inline-block;padding:10px 18px;background:#111;color:#fff;text-decoration:none;border-radius:6px;">
                ${T.cta}
              </a>
            </p>
            <p>${acceptUrl}</p>
          `,
        }),
        signal: controller.signal,
      });
    } catch (_) {
    } finally {
      clearTimeout(timeout);
    }

    return json(200, {
      ok: true,
      invite_id: invite.id,
      reused_existing: !!existingInvite,
      lang_used: langFinal,
      build_tag: BUILD_TAG,
    });

  } catch (err) {
    return json(500, {
      ok: false,
      error: "UNCAUGHT_EXCEPTION",
      detail: String(err),
      build_tag: BUILD_TAG,
    });
  }
});
