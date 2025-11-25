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
  if (missing.length) {
    throw new Error(
      `[supabaseClient] Faltan variables de entorno: ${missing.join(', ')}`
    );
  }
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
      global: {
        headers: {
          'x-app-name': 'app-geocercas',
        },
      },
    });
  }
  return _supabase;
}

export const supabase = getSupabase();
export default supabase;

// ---------------- HELPERS DE AUTENTICACIÓN ----------------

export async function signOutEverywhere() {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  } catch (err) {
    console.error('[signOutEverywhere] error', err);
  }
}

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

export async function getProfileSafe() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error) throw error;
    return data;
  } catch (e) {
    console.error('[getProfileSafe]', e);
    return null;
  }
}
