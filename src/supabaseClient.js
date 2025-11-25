// src/supabaseClient.js
import { createClient } from '@supabase/supabase-js';

// ---------------- ENV LOADER ----------------
function readEnv(key) {
  const vite = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key];
  if (vite !== undefined && vite !== '') return vite;

  const hasProcess = typeof process !== 'undefined' && typeof process.env !== 'undefined';
  if (hasProcess) {
    const nodeVal = process.env[key];
    if (nodeVal !== undefined && nodeVal !== '') return nodeVal;
  }

  if (typeof window !== 'undefined' && window.__ENV__ && window.__ENV__[key]) {
    return window.__ENV__[key];
  }
  return undefined;
}

const SUPABASE_URL = readEnv('VITE_SUPABASE_URL');
const SUPABASE_ANON_KEY = readEnv('VITE_SUPABASE_ANON_KEY');

(function assertEnv() {
  const missing = [];
  if (!SUPABASE_URL) missing.push('VITE_SUPABASE_URL');
  if (!SUPABASE_ANON_KEY) missing.push('VITE_SUPABASE_ANON_KEY');
  if (missing.length) throw new Error(`[SupabaseClient] Faltan variables de entorno: ${missing.join(', ')}`);
})();

// --------------- SINGLETON -------------------
let _supabase;
export function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
      global: { headers: { 'x-app-name': 'app-geocercas' } },
    });
  }
  return _supabase;
}
export const supabase = getSupabase();

// ✅ Export default para soportar imports por default en archivos antiguos
export default supabase;

// --------------- AUTH HELPERS ----------------
export async function getSessionSafe() {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session ?? null;
  } catch (e) {
    console.error('[getSessionSafe]', e);
    return null;
  }
}

export async function getUserSafe() {
  try {
    const { data } = await supabase.auth.getUser();
    return data?.user ?? null;
  } catch (e) {
    console.error('[getUserSafe]', e);
    return null;
  }
}

export async function signInWithPassword({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data?.user ?? null;
}

export async function signInWithEmailOtp(email, redirectTo) {
  const emailRedirectTo = redirectTo ?? (typeof window !== 'undefined' ? window.location.origin : undefined);
  const { data, error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo },
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  return true;
}

export function onAuthChange(callback) {
  const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
    try {
      callback?.(event, session);
    } catch (e) {
      console.error('[onAuthChange callback]', e);
    }
  });
  return () => sub?.subscription?.unsubscribe?.();
}

export async function tryExchangeCodeForSessionIfPresent() {
  try {
    if (typeof window === 'undefined') return false;
    const url = new URL(window.location.href);

    const codeFromQuery = url.searchParams.get('code');
    let codeFromHash = null;
    if (url.hash && url.hash.includes('code=')) {
      const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
      codeFromHash = hashParams.get('code');
    }
    const code = codeFromQuery || codeFromHash;
    if (!code) return false;

    await supabase.auth.exchangeCodeForSession({ code }).catch(() => {});
    if (codeFromQuery) {
      url.searchParams.delete('code');
      window.history.replaceState({}, document.title, url.toString());
    } else if (codeFromHash) {
      window.history.replaceState({}, document.title, url.toString().split('#')[0]);
    }
    return true;
  } catch (e) {
    console.warn('[tryExchangeCodeForSessionIfPresent]', e);
    return false;
  }
}

// --------------- PROFILE ----------------
export async function getProfileSafe() {
  try {
    const user = await getUserSafe();
    if (!user) return null;

    const { data, error } = await supabase
      .from('profiles')
      .select('tenant_id:org_id, id, email, full_name, role, is_active, created_at')
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      console.warn('[getProfileSafe] RLS/cols', error.message);
      return null;
    }
    return data ?? null;
  } catch (e) {
    console.error('[getProfileSafe]', e);
    return null;
  }
}

// --------------- UTILS ----------------
export const isEnvReady = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
export const envInfo = {
  hasUrl: Boolean(SUPABASE_URL),
  hasAnonKey: Boolean(SUPABASE_ANON_KEY),
};
