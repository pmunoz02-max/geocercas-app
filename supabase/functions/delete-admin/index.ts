import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { getAdminClient } from "../_shared/supabaseAdmin.ts";
import { requireRole } from "../_shared/authz.ts";

type Payload = { user_id: string; org_id?: string };

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  try {
    // Only app root by default; if you use 'root' instead, change here
    await requireRole(req, "root");

    const body: Payload = await req.json();
    const userId = String(body?.user_id || "").trim();
    if (!userId) throw new Error("user_id required");

    const orgId = body.org_id ? String(body.org_id) : null;

    const supabase = getAdminClient();
    const rolesTable = Deno.env.get("USER_ROLES_TABLE") ?? "user_roles";

    // Remove admin role assignment first (best effort)
    if (orgId) {
      await supabase.from(rolesTable).delete().eq("user_id", userId).eq("org_id", orgId);
    } else {
      await supabase.from(rolesTable).delete().eq("user_id", userId).eq("role", "admin");
    }

    // Optionally do NOT delete auth user here (admin may remain in other orgs)
    const hard = (Deno.env.get("DELETE_ADMIN_AUTH_USER") ?? "false").toLowerCase() === "true";
    if (hard) {
      const { error } = await supabase.auth.admin.deleteUser(userId);
      if (error) throw new Error(error.message);
    }

    return new Response(
      JSON.stringify({ ok: true, removed: true, user_id: userId, org_id: orgId, deleted_auth: hard }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: String(e?.message || e) }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
