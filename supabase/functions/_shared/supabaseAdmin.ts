// supabase/functions/_shared/supabaseAdmin.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function required(name: string, v?: string) {
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

export function getSupabaseUrl() {
  return required("SUPABASE_URL", Deno.env.get("SUPABASE_URL"));
}

export function getAnonKey() {
  // Permite nombres alternos por compatibilidad
  const anon =
    Deno.env.get("SUPABASE_ANON_KEY") ??
    Deno.env.get("SUPABASE_PUBLIC_ANON_KEY") ??
    "";
  required("SUPABASE_ANON_KEY", anon);
  return anon;
}

export function getServiceRoleKey() {
  const service =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    Deno.env.get("SUPABASE_SERVICE_KEY") ??
    "";
  required("SUPABASE_SERVICE_ROLE_KEY", service);
  return service;
}

export function getAdminClient() {
  const url = getSupabaseUrl();
  const service = getServiceRoleKey();

  return createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "X-Client-Info": "geocercas-edge/1.0" } },
  });
}

/**
 * Cliente "user-scoped": valida JWT y ejecuta queries con RLS.
 * IMPORTANTÍSIMO: propaga Authorization del request.
 */
export function getUserClient(req: Request) {
  const url = getSupabaseUrl();
  const anon = getAnonKey();
  const authHeader = req.headers.get("Authorization") || req.headers.get("authorization") || "";

  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      headers: {
        Authorization: authHeader,
        "X-Client-Info": "geocercas-edge/1.0",
      },
    },
  });
}
