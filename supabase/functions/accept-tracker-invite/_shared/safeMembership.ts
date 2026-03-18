import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

type MembershipRole = "owner" | "admin" | "tracker";

const ROLE_PRIORITY: Record<MembershipRole, number> = {
  owner: 3,
  admin: 2,
  tracker: 1,
};

function normRole(role: unknown): MembershipRole {
  const raw = String(role ?? "").trim().toLowerCase();
  if (raw === "owner" || raw === "admin" || raw === "tracker") return raw;
  return "tracker";
}

export async function safeUpsertMembership(
  admin: SupabaseClient,
  params: { org_id: string; user_id: string; new_role: unknown },
) {
  const newRole = normRole(params.new_role);

  // First, try to find an active (non-revoked) membership
  const { data: existing, error: existingErr } = await admin
    .from("memberships")
    .select("org_id, user_id, role, revoked_at")
    .eq("org_id", params.org_id)
    .eq("user_id", params.user_id)
    .is("revoked_at", null)
    .limit(1)
    .maybeSingle();

  if (existingErr) {
    return {
      ok: false as const,
      action: "select_failed" as const,
      error: existingErr,
    };
  }

  if (!existing) {
    // No active membership found. Check if a revoked membership exists
    const { data: revoked, error: revokedErr } = await admin
      .from("memberships")
      .select("org_id, user_id, role, revoked_at")
      .eq("org_id", params.org_id)
      .eq("user_id", params.user_id)
      .not("revoked_at", "is", null)
      .limit(1)
      .maybeSingle();

    if (revokedErr) {
      return {
        ok: false as const,
        action: "select_failed" as const,
        error: revokedErr,
      };
    }

    if (revoked) {
      // A revoked membership exists. Reactivate and upgrade if needed.
      const revokedRole = normRole(revoked.role);
      const shouldUpgrade = ROLE_PRIORITY[newRole] > ROLE_PRIORITY[revokedRole];

      const roleToApply = shouldUpgrade ? newRole : revokedRole;

      const { error: updateErr } = await admin
        .from("memberships")
        .update({
          role: roleToApply,
          is_default: true,
          revoked_at: null,
        })
        .eq("org_id", params.org_id)
        .eq("user_id", params.user_id)
        .not("revoked_at", "is", null);

      if (updateErr) {
        return {
          ok: false as const,
          action: "reactivate_failed" as const,
          error: updateErr,
        };
      }

      return {
        ok: true as const,
        action: shouldUpgrade ? "upgraded" : "kept",
        role_applied: roleToApply,
        role_existing: revokedRole,
      };
    }

    // No membership at all - insert a new one
    const { error: insertErr } = await admin
      .from("memberships")
      .insert({
        org_id: params.org_id,
        user_id: params.user_id,
        role: newRole,
        is_default: true,
        revoked_at: null,
      });

    if (insertErr) {
      return {
        ok: false as const,
        action: "insert_failed" as const,
        error: insertErr,
      };
    }

    return {
      ok: true as const,
      action: "inserted" as const,
      role_applied: newRole,
      role_existing: null,
    };
  }

  // Active membership exists - check upgrade logic
  const currentRole = normRole(existing.role);
  const shouldUpgrade = ROLE_PRIORITY[newRole] > ROLE_PRIORITY[currentRole];

  if (!shouldUpgrade) {
    return {
      ok: true as const,
      action: "kept" as const,
      role_applied: currentRole,
      role_existing: currentRole,
    };
  }

  const { error: updateErr } = await admin
    .from("memberships")
    .update({
      role: newRole,
      is_default: true,
      revoked_at: null,
    })
    .eq("org_id", params.org_id)
    .eq("user_id", params.user_id)
    .is("revoked_at", null);

  if (updateErr) {
    return {
      ok: false as const,
      action: "update_failed" as const,
      error: updateErr,
    };
  }

  return {
    ok: true as const,
    action: "upgraded" as const,
    role_applied: newRole,
    role_existing: currentRole,
  };
}

/**
 * Safely revoke/deactivate a membership by setting revoked_at.
 * Uses soft-delete pattern to preserve audit trail.
 * Only revokes active memberships (revoked_at IS NULL).
 */
export async function safeRevokeMembership(
  admin: SupabaseClient,
  params: { org_id: string; user_id: string },
) {
  const nowIso = new Date().toISOString();

  // Find active membership
  const { data: existing, error: existingErr } = await admin
    .from("memberships")
    .select("org_id, user_id, role, revoked_at")
    .eq("org_id", params.org_id)
    .eq("user_id", params.user_id)
    .is("revoked_at", null)
    .limit(1)
    .maybeSingle();

  if (existingErr) {
    return {
      ok: false as const,
      action: "select_failed" as const,
      error: existingErr,
    };
  }

  if (!existing) {
    // No active membership - already revoked or never existed
    return {
      ok: true as const,
      action: "not_found" as const,
      error: null,
    };
  }

  // Revoke the active membership
  const { error: updateErr } = await admin
    .from("memberships")
    .update({
      revoked_at: nowIso,
    })
    .eq("org_id", params.org_id)
    .eq("user_id", params.user_id)
    .is("revoked_at", null);

  if (updateErr) {
    return {
      ok: false as const,
      action: "revoke_failed" as const,
      error: updateErr,
    };
  }

  return {
    ok: true as const,
    action: "revoked" as const,
    error: null,
  };
}
