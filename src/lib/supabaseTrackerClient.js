import { createClient } from "@supabase/supabase-js";

function safeLocalStorage() {
  try {
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  } catch {}
  return undefined;
}

const url = import.meta.env.VITE_SUPABASE_TRACKER_URL?.trim();
const anon = import.meta.env.VITE_SUPABASE_TRACKER_ANON_KEY?.trim();

let client = null;

if (url && anon) {
  // 👇 SINGLETON GLOBAL
  if (!window.__SUPABASE_TRACKER__) {
    window.__SUPABASE_TRACKER__ = createClient(url, anon, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: "sb-tracker-auth",
        storage: safeLocalStorage(),
      },
    });
  }

  client = window.__SUPABASE_TRACKER__;
}

export const supabaseTracker = client;
