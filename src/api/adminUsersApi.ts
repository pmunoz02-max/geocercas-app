// src/api/adminUsersApi.ts
import { supabase } from "@/supabaseClient";

export async function deleteUserCompletely(targetUserId: string) {
  const { data, error } = await supabase.functions.invoke("delete-user", {
    body: { targetUserId },
  });

  if (error) {
    console.error("[deleteUserCompletely] error:", error);
    throw error;
  }

  return data; // { success: true }
}
