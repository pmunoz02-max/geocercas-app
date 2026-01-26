// src/lib/supabaseClient.ts
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY as string | undefined;

function assertEnv(name: string, value?: string) {
  if (!value || typeof value !== "string" || !value.trim()) {
    // Lanzar error visible evita que supabase-js “caiga” a requests relativas tipo /auth/v1/otp
    throw new Error(`[supabaseClient] Missing ${name}. Check Vercel env vars (VITE_*) and redeploy.`);
  }
}

assertEnv("VITE_SUPABASE_URL", supabaseUrl);
assertEnv("VITE_SUPABASE_ANON_KEY", supabaseAnonKey);

export const supabase = createClient(supabaseUrl!, supabaseAnonKey!, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: "pkce",
  },
});
