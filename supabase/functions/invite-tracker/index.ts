import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { getAdminClient } from "../_shared/supabaseAdmin.ts";
import { requireRole } from "../_shared/authz.ts";

type Payload = {
  email: string;
  org_id?: string;
  redirectTo?: string;
  role?: string; // default 'tracker'
};

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  try {
    await requireRole(req, "admin");

    const body: Payload = await req.json();
    const email = String(body?.email || "").trim().toLowerCase();
    if (!email) throw new Error("email required");

    const role = String(body.role || "tracker");
    const orgId = body.org_id ? String(body.org_id) : null;

    const redirectTo =
      String(body.redirectTo || "").trim() ||
      Deno.env.get("INVITE_REDIRECT_TO") ||
      "";

    const supabase = getAdminClient();

    // Invite user (Supabase will email if SMTP configured; otherwise returns action_link)
    const { data, error } = await supabase.auth.admin.generateLink({
      type: "invite",
      email,
      options: redirectTo ? { redirectTo } : undefined,
    });
    if (error) throw new Error(error.message);

    const userId = data?.user?.id ?? null;

    // Optional: write role assignment into your app table (env-driven)
    const rolesTable = Deno.env.get("USER_ROLES_TABLE") ?? "user_roles";
    if (userId) {
      const payload: any = { user_id: userId, role };
      if (orgId) payload.org_id = orgId;

      const { error: e2 } = await supabase.from(rolesTable).upsert(payload, {
        onConflict: orgId ? "user_id,org_id" : "user_id",
      });
      // If your schema differs, don't fail the invite; just report.
      if (e2) {
        return new Response(
          JSON.stringify({
            ok: true,
            invited: true,
            user_id: userId,
            role_written: false,
            role_error: e2.message,
            action_link: data?.properties?.action_link ?? null,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        invited: true,
        user_id: userId,
        action_link: data?.properties?.action_link ?? null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: String(e?.message || e) }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
