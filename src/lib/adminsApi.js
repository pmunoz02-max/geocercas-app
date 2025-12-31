// src/lib/adminsApi.js
import { supabase } from "./supabaseClient";

/**
 * Invita un nuevo administrador u owner.
 * LLAMA DIRECTAMENTE a la Edge Function invite_admin
 */
export async function inviteAdmin({ email, role = "admin" }) {
  console.log("[adminsApi] inviteAdmin start", { email, role });

  if (!email) {
    throw new Error("Email requerido");
  }

  const { data, error } = await supabase.functions.invoke("invite_admin", {
    body: {
      email,
      role,
    },
  });

  console.log("[adminsApi] inviteAdmin raw response", { data, error });

  if (error) {
    // Error real del backend (status, message, etc.)
    throw error;
  }

  if (!data?.ok) {
    throw new Error(data?.message || "Error desconocido al invitar admin");
  }

  return data;
}
