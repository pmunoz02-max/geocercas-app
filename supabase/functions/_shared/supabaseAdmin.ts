// supabase/functions/_shared/supabaseAdmin.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function required(name: string, v?: string) {
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

export function getAdminClient() {
  const url = required("SUPABASE_URL", Deno.env.get("SUPABASE_URL"));
  // Prefer SERVICE_ROLE; fallback to SERVICE_KEY if you used that name before
  const service =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    Deno.env.get("SUPABASE_SERVICE_KEY") ??
    "";
  required("SUPABASE_SERVICE_ROLE_KEY", service);

  return createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "X-Client-Info": "geocercas-edge/1.0" } },
  });
}
