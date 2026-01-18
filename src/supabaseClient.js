// src/supabaseClient.js
try {
  // eslint-disable-next-line no-console
  console.log("[ENV CHECK]", {
    MODE: import.meta.env.MODE,
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
    HAS_ANON_KEY: Boolean(import.meta.env.VITE_SUPABASE_ANON_KEY),
  });
} catch (e) {
  // eslint-disable-next-line no-console
  console.log("[ENV CHECK] (skipped)", e);
}

export { default } from "./lib/supabaseClient";
export * from "./lib/supabaseClient";
