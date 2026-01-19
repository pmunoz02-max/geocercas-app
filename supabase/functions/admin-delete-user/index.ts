import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { getAdminClient } from "../_shared/supabaseAdmin.ts";
import { requireRole } from "../_shared/authz.ts";

type Payload = {
  user_id: string;
  hard?: boolean; // if true, also attempt cleanup in app tables
};

async function cleanupAppData(supabase: any, userId: string) {
  // Optional cleanup: call an RPC if you have one, else best-effort delete from tables
  const rpc = Deno.env.get("CLEANUP_RPC") ?? "";
  if (rpc) {
    const { error } = await supabase.rpc(rpc, { p_user_id: userId });
    if (error) return { ok: false, method: "rpc", error: error.message };
    return { ok: true, method: "rpc" };
  }

  const tables = (Deno.env.get("CLEANUP_TABLES") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const results: any[] = [];
  for (const t of tables) {
    // expects column user_id
    const { error } = await supabase.from(t).delete().eq("user_id", userId);
    results.push({ table: t, ok: !error, error: error?.message ?? null });
  }
  return { ok: true, method: "tables", results };
}

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  try {
    await requireRole(req, "admin");

    const body: Payload = await req.json();
    const userId = String(body?.user_id || "").trim();
    if (!userId) throw new Error("user_id required");

    const supabase = getAdminClient();

    const cleanup = body.hard ? await cleanupAppData(supabase, userId) : null;

    const { error } = await supabase.auth.admin.deleteUser(userId);
    if (error) throw new Error(error.message);

    return new Response(
      JSON.stringify({ ok: true, deleted: true, user_id: userId, cleanup }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: String(e?.message || e) }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
