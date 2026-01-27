// src/lib/createOrganizationAndOwner.js
// Flujo para crear un NUEVO OWNER independiente,
// que tendrá su propia organización.
//
// Importante:
//   - La Edge Function `invite-user` debe aceptar:
//       { email, full_name, role_name: "OWNER", org_id: null }
//   - En el backend, `invite-user` debe:
      1) crear una nueva organización (org)
      2) crear la membresía en `memberships` con role = 'owner'
      3) opcional: marcar is_default = true para ese nuevo owner
    (Triggers sincronizan `app_user_roles` automáticamente; NO escribirla desde cliente.)

import { supabase } from "../supabaseClient";

/**
 * Invita a un nuevo OWNER independiente (nueva organización).
 *
 * @param {{ email: string, full_name?: string }} params
 * @returns {Promise<{data: any | null, error: any}>}
 */
export async function createIndependentOwner(params) {
  const { email, full_name } = params || {};

  if (!email) {
    return { data: null, error: new Error("Email requerido para crear owner") };
  }

  // La Edge Function `invite-user` debe manejar:
  // - role_name = "OWNER"
  // - org_id = null  → se inserta app_user_roles con org_id NULL
  //   y el trigger `ensure_org_for_owner_role` crea la organización.
  const { data, error } = await supabase.functions.invoke("invite-user", {
    body: {
      email,
      full_name: full_name ?? null,
      role_name: "OWNER",
      org_id: null,
    },
  });

  return { data, error };
}
