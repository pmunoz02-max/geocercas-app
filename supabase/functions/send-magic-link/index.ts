import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { getAdminClient } from "../_shared/supabaseAdmin.ts";
import { requireRole } from "../_shared/authz.ts";
import { sendEmailResend } from "../_shared/email.ts";

type Payload = { email: string; redirectTo?: string };

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  try {
    await requireRole(req, "admin");

    const body: Payload = await req.json();
    const email = String(body?.email || "").trim().toLowerCase();
    if (!email) throw new Error("email required");

    const redirectTo =
      String(body.redirectTo || "").trim() ||
      Deno.env.get("MAGIC_REDIRECT_TO") ||
      "";

    const supabase = getAdminClient();

    const { data, error } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: redirectTo ? { redirectTo } : undefined,
    });
    if (error) throw new Error(error.message);

    const actionLink = data?.properties?.action_link;
    if (!actionLink) throw new Error("No action_link returned");

    const send = await sendEmailResend(
      email,
      "Tu enlace de acceso",
      `<p>Hola,</p><p>Enlace para ingresar:</p><p><a href="${actionLink}">Ingresar</a></p>`,
    );

    return new Response(
      JSON.stringify({ ok: true, action_link: actionLink, email_sent: send }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: String(e?.message || e) }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
