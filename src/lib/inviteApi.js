// src/lib/inviteApi.js
import { supabase } from '../supabaseClient';

/**
 * Envía un Magic Link por email para que el usuario se autentique.
 * El enlace redirige al móvil a /tracker/auto con el tenant preseleccionado.
 *
 * @param {string} email - email del tracker
 * @param {string} tenantId - org/tenant UUID
 * @param {string} [redirectOrigin] - (opcional) origen absoluto, por defecto window.location.origin
 * @returns {Promise<void>}
 */
export async function sendMagicLinkToTracker(email, tenantId, redirectOrigin) {
  if (!email) throw new Error('Email requerido');
  if (!tenantId) throw new Error('Tenant/Org ID requerido');

  const origin = redirectOrigin || window.location.origin;
  // Al autenticarse, Supabase redirige aquí:
  const emailRedirectTo = `${origin}/tracker/auto?tenant=${encodeURIComponent(tenantId)}`;

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo,
      shouldCreateUser: true, // crea el usuario si no existe
      data: { invited_as: 'tracker', tenant_id: tenantId }, // metadatos opcionales
    },
  });

  if (error) throw error;
}
