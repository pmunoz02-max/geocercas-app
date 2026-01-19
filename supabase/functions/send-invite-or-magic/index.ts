import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { getAdminClient } from "../_shared/supabaseAdmin.ts";
import { requireRole } from "../_shared/authz.ts";
import { sendEmailResend } from "../_shared/email.ts";

type Payload = {
  email: string;
  redirectTo?: string;
  mode?: "invite" | "magiclink"; // default invite
};

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  try {
    await requireRole(req, "admin");

    const body: Payload = await req.json();
    const email = String(body?.email || "").trim().toLowerCase();
    if (!email) throw new Error("email required");

    const mode = (body.mode || "invite") as "invite" | "magiclink";
    const redirectTo =
      String(body.redirectTo || "").trim() ||
      Deno.env.get("INVITE_REDIRECT_TO") ||
      "";

    const supabase = getAdminClient();

    const { data, error } = await supabase.auth.admin.generateLink({
      type: mode === "magiclink" ? "magiclink" : "invite",
      email,
      options: redirectTo ? { redirectTo } : undefined,
    });
    if (error) throw new Error(error.message);

    const actionLink = data?.properties?.action_link;
    if (!actionLink) throw new Error("No action_link returned");

    const subject = mode === "invite" ? "Invitación" : "Enlace de acceso";
    const send = await sendEmailResend(
      email,
      subject,
      `<p>Hola,</p><p>${subject}:</p><p><a href="${actionLink}">Abrir enlace</a></p>`,
    );

    return new Response(
      JSON.stringify({ ok: true, mode, action_link: actionLink, email_sent: send }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: String(e?.message || e) }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
