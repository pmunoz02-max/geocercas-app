// supabase/functions/_shared/authz.ts
import { getAdminClient } from "./supabaseAdmin.ts";

// Simple authz helper: require a valid JWT and optionally require a role in user_roles table.
// If you don't use user_roles, you can set REQUIRE_ROLE=false in function env and it will only require a valid user.
export async function requireUser(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const jwt = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!jwt) throw new Error("Missing Authorization Bearer token");

  const supabase = getAdminClient();
  const { data, error } = await supabase.auth.getUser(jwt);
  if (error || !data?.user) throw new Error("Invalid token");
  return data.user;
}

export async function requireRole(req: Request, role: string) {
  const user = await requireUser(req);

  const requireRoleFlag =
    (Deno.env.get("REQUIRE_ROLE") ?? "true").toLowerCase() === "true";
  if (!requireRoleFlag) return user;

  const supabase = getAdminClient();
  const table = Deno.env.get("USER_ROLES_TABLE") ?? "user_roles";

  // Expect columns: user_id, role (and optionally org_id)
  const { data, error } = await supabase
    .from(table)
    .select("role")
    .eq("user_id", user.id)
    .limit(50);

  if (error) throw new Error(`Role check failed: ${error.message}`);
  const roles = new Set((data ?? []).map((r: any) => String(r.role)));
  if (!roles.has(role)) throw new Error("Forbidden");
  return user;
}
