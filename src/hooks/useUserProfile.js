// src/hooks/useUserProfile.js
import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "../supabaseClient";

export function useUserProfile() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const mounted = useRef(true);

  const safeSet = (fn) => mounted.current && fn();

  const fetchProfile = useCallback(async () => {
    safeSet(() => { setLoading(true); setErr(null); });

    try {
      // 1) Sesión
      const { data: sess, error: sErr } = await supabase.auth.getSession();
      if (sErr) throw sErr;

      const user = sess?.session?.user || null;
      if (!user) {
        safeSet(() => setProfile(null));
        return;
      }

      // 2) RPC (bypass RLS de la tabla profiles)
      const { data, error } = await supabase.rpc("get_my_profile");
      if (error) {
        // si el RPC falla, al menos mostramos el email
        safeSet(() => {
          setErr(error.message);
          setProfile({ user_id: user.id, email: user.email, rol: null });
        });
        return;
      }

      const row = Array.isArray(data) ? data[0] : data;
      safeSet(() =>
        setProfile({
          user_id: row?.user_id ?? user.id,
          email: user.email,
          rol: row?.rol ?? null,
        })
      );
    } catch (e) {
      safeSet(() => {
        setErr(e?.message || String(e));
        setProfile((p) => p ?? null);
      });
    } finally {
      safeSet(() => setLoading(false));
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    fetchProfile();

    // escuchar cambios de auth sin entrar en loop
    const { data: sub } = supabase.auth.onAuthStateChange((_evt) => {
      fetchProfile();
    });

    return () => {
      mounted.current = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, [fetchProfile]);

  return { profile, loading, err, refresh: fetchProfile };
}
