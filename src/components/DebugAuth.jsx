// src/components/DebugAuth.jsx
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../supabaseClient";

/**
 * Componente de depuración para verificar:
 *  - Proyecto al que apunta el front (URL y key recortada)
 *  - Sesión actual (uid, email)
 *  - Fila en public.profiles (user_id, rol, org_id)
 *  - Errores de RLS o de consulta
 */
export default function DebugAuth() {
  const { t } = useTranslation();
  const tr = (key, fallback, options = {}) =>
    t(key, { defaultValue: fallback, ...options });

  const [sessionInfo, setSessionInfo] = useState(null);
  const [profileInfo, setProfileInfo] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    setError(null);

    try {
      const proj = {
        url: import.meta.env.VITE_SUPABASE_URL,
        anonKeyPrefix: (import.meta.env.VITE_SUPABASE_ANON_KEY || "").slice(0, 10) + "…",
      };

      const { data: s } = await supabase.auth.getSession();
      const user = s?.session?.user || null;
      const sess = {
        userId: user?.id || null,
        email: user?.email || null,
        aud: user?.aud || null,
      };
      setSessionInfo({ ...proj, ...sess });

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
      <h2 className="text-lg font-semibold mb-3">
        {tr("debugAuth.title", "Debug Auth / Roles")}
      </h2>

      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={refresh}
          className="border rounded px-3 py-1 hover:bg-gray-50 disabled:opacity-50"
          disabled={loading}
        >
          {loading
            ? tr("debugAuth.actions.refreshing", "Refreshing…")
            : tr("debugAuth.actions.refresh", "Refresh")}
        </button>

        <button
          type="button"
          onClick={signOut}
          className="border rounded px-3 py-1 hover:bg-gray-50"
        >
          {tr("debugAuth.actions.signOut", "Sign out")}
        </button>
      </div>

      {sessionInfo && (
        <div className="mb-4">
          <h3 className="font-medium">
            {tr("debugAuth.sections.project", "Project")}
          </h3>
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

          <h3 className="font-medium mt-3">
            {tr("debugAuth.sections.currentSession", "Current session")}
          </h3>
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

      <h3 className="font-medium">
        {tr("debugAuth.sections.profile", "Profile (public.profiles)")}
      </h3>
      <pre className="bg-gray-50 p-3 rounded overflow-auto text-sm">
{JSON.stringify(
  profileInfo ?? { user_id: null, rol: null, org_id: null },
  null,
  2
)}
      </pre>

      {error && (
        <div className="mt-4 bg-red-50 text-red-700 p-3 rounded">
          <strong>{tr("auth.errorTitle", "Error")}:</strong> {error}
          <p className="text-sm mt-1">
            {tr(
              "debugAuth.errors.rlsHint",
              "If it is 401/403, it is usually RLS. Verify policies: USING (user_id = auth.uid()) / WITH CHECK (user_id = auth.uid())."
            )}
          </p>
        </div>
      )}
    </div>
  );
}