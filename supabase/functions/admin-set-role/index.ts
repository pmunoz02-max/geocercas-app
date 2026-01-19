import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { getAdminClient } from "../_shared/supabaseAdmin.ts";
import { requireRole } from "../_shared/authz.ts";

type Payload = {
  user_id: string;
  role: string;
  org_id?: string;
};

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  try {
    await requireRole(req, "root");

    const body: Payload = await req.json();
    const userId = String(body?.user_id || "").trim();
    const role = String(body?.role || "").trim();
    const orgId = body.org_id ? String(body.org_id) : null;

    if (!userId || !role) throw new Error("user_id and role required");

    const supabase = getAdminClient();
    const rolesTable = Deno.env.get("USER_ROLES_TABLE") ?? "user_roles";

    const payload: any = { user_id: userId, role };
    if (orgId) payload.org_id = orgId;

    const { error } = await supabase.from(rolesTable).upsert(payload, {
      onConflict: orgId ? "user_id,org_id" : "user_id",
    });
    if (error) throw new Error(error.message);

    return new Response(
      JSON.stringify({ ok: true, user_id: userId, role, org_id: orgId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: String(e?.message || e) }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
