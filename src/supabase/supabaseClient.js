// src/supabase/supabaseClient.js
export { default, supabase, getSupabase,
  getSessionSafe, getUserSafe, signInWithPassword, signInWithEmailOtp,
  signOut, onAuthChange, tryExchangeCodeForSessionIfPresent,
  getProfileSafe, isEnvReady, envInfo
} from "../supabaseClient.js";
