// src/services/invitations.ts
import { supabase } from "@/lib/supabaseClient";
import type { Role } from "./orgs";

export interface Invitation {
  id: string;
  org_id: string;
  email: string;
  role: Role;
  token: string;
  status: "pending" | "accepted" | "cancelled" | "expired";
  invited_by: string;
  created_at: string;
  expires_at: string;
}

// Crear invitación
export async function inviteMember(orgId: string, email: string, role: Role = "viewer") {
  const { data, error } = await supabase.rpc("invite_member", {
    p_org: orgId,
    p_email: email,
    p_role: role,
  });
  if (error) throw error;
  return data as Invitation;
}

// Listar invitaciones de una organización (solo owner/admin)
export async function listInvitations(orgId: string) {
  const { data, error } = await supabase
    .from("invitations")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Invitation[];
}

// Cancelar invitación
export async function cancelInvitation(inviteId: string) {
  const { error } = await supabase.rpc("cancel_invitation", { p_invite_id: inviteId });
  if (error) throw error;
  return true;
}

// Aceptar invitación por token
export async function acceptInvitation(token: string) {
  const { data, error } = await supabase.rpc("accept_invitation", { p_token: token });
  if (error) throw error;
  return data;
}
