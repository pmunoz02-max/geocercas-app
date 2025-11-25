// src/components/DebugAuth.jsx
import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

/**
 * Componente de depuración para verificar:
 *  - Proyecto al que apunta el front (URL y key recortada)
 *  - Sesión actual (uid, email)
 *  - Fila en public.profiles (user_id, rol, org_id)
 *  - Errores de RLS o de consulta
 */
export default function DebugAuth() {
  const [sessionInfo, setSessionInfo] = useState(null);
  const [profileInfo, setProfileInfo] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    setError(null);

    try {
      // 1) Info de proyecto (para confirmar que el front apunta al proyecto correcto)
      const proj = {
        url: import.meta.env.VITE_SUPABASE_URL,
        anonKeyPrefix: (import.meta.env.VITE_SUPABASE_ANON_KEY || "").slice(0, 10) + "…",
      };

      // 2) Sesión actual
      const { data: s } = await supabase.auth.getSession();
      const user = s?.session?.user || null;
      const sess = {
        userId: user?.id || null,
        email: user?.email || null,
        aud: user?.aud || null,
      };
      setSessionInfo({ ...proj, ...sess });

      // 3) Profile en DB
      if (user?.id) {
        const { data, error: qErr } = await supabase
          .from("profiles")
          .select("user_id, rol, org_id")
          .eq("user_id", user.id)
          .single();

        if (qErr) {
          setProfileInfo(null);
          setError(qErr.message);
        } else {
          setProfileInfo({
            user_id: data?.user_id ?? null,
            rol: data?.rol ?? null,
            org_id: data?.org_id ?? null,
          });
        }
      } else {
        setProfileInfo(null);
      }
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // Reintenta cuando cambie el estado de auth (login/logout)
    const { data: sub } = supabase.auth.onAuthStateChange(() => refresh());
    return () => sub.subscription?.unsubscribe?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    await refresh();
  };

  return (
    <div className="max-w-2xl mx-auto p-4 my-6 rounded-2xl border shadow-sm">
      <h2 className="text-lg font-semibold mb-3">Debug Auth / Roles</h2>

      <div className="flex gap-2 mb-4">
        <button
          onClick={refresh}
          className="border rounded px-3 py-1 hover:bg-gray-50 disabled:opacity-50"
          disabled={loading}
        >
          {loading ? "Actualizando…" : "Refrescar"}
        </button>
        <button
          onClick={signOut}
          className="border rounded px-3 py-1 hover:bg-gray-50"
        >
          Cerrar sesión
        </button>
      </div>

      {sessionInfo && (
        <div className="mb-4">
          <h3 className="font-medium">Proyecto</h3>
          <pre className="bg-gray-50 p-3 rounded overflow-auto text-sm">
{JSON.stringify(
  {
    supabaseUrl: sessionInfo.url,
    anonKeyPrefix: sessionInfo.anonKeyPrefix,
  },
  null,
  2
)}
          </pre>

          <h3 className="font-medium mt-3">Sesión actual</h3>
          <pre className="bg-gray-50 p-3 rounded overflow-auto text-sm">
{JSON.stringify(
  {
    userId: sessionInfo.userId,
    email: sessionInfo.email,
    aud: sessionInfo.aud,
  },
  null,
  2
)}
          </pre>
        </div>
      )}

      <h3 className="font-medium">Perfil (public.profiles)</h3>
      <pre className="bg-gray-50 p-3 rounded overflow-auto text-sm">
{JSON.stringify(
  profileInfo ?? { user_id: null, rol: null, org_id: null },
  null,
  2
)}
      </pre>

      {error && (
        <div className="mt-4 bg-red-50 text-red-700 p-3 rounded">
          <strong>Error:</strong> {error}
          <p className="text-sm mt-1">
            Si es 401/403 suele ser RLS. Verifica policies:
            USING (user_id = auth.uid()) / WITH CHECK (user_id = auth.uid()).
          </p>
        </div>
      )}
    </div>
  );
}
