// api/lib/resolveOrg.js
export async function resolveOrgAndMembership(admin, userId, requestedOrgId) {
  // 1) Org explícita desde header
  if (requestedOrgId) {
    const { data, error } = await admin
      .from("memberships")
      .select("org_id, role, is_default, revoked_at")
      .eq("user_id", userId)
      .eq("org_id", requestedOrgId)
      .is("revoked_at", null)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (data) return data;
  }

  // 2) Org default
  {
    const { data, error } = await admin
      .from("memberships")
      .select("org_id, role, is_default, revoked_at")
      .eq("user_id", userId)
      .eq("is_default", true)
      .is("revoked_at", null)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (data) return data;
  }

  // 3) Fallback: primera org activa
  {
    const { data, error } = await admin
      .from("memberships")
      .select("org_id, role, is_default, revoked_at")
      .eq("user_id", userId)
      .is("revoked_at", null)
      .order("created_at", { ascending: true })
      .limit(1);

    if (error) throw new Error(error.message);
    if (Array.isArray(data) && data.length) return data[0];
  }

  return null;
}
