// src/lib/membershipsService.js
import { supabase } from './supabaseClient';

export async function listMembers(orgId) {
  const { data, error } = await supabase.rpc('list_members_with_email', { p_org: orgId });
  if (error) throw error;
  return data ?? [];
}

export async function inviteByEmail(orgId, email, role) {
  const { error } = await supabase.rpc('invite_member_by_email', {
    p_org: orgId,
    p_email: email,
    p_role: role, // 'owner'|'admin'|'tracker' según enum
  });
  if (error) throw error;
}

export async function setMemberRole(orgId, userId, role) {
  const { error } = await supabase.rpc('set_member_role', {
    p_org: orgId,
    p_user: userId,
    p_role: role,
  });
  if (error) throw error;
}

export async function removeMember(orgId, userId) {
  const { error } = await supabase.rpc('remove_member', {
    p_org: orgId,
    p_user: userId,
  });
  if (error) throw error;
}
