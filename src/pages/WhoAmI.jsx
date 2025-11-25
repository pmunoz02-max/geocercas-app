// src/pages/WhoAmI.jsx
import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

export default function WhoAmI() {
  const [envInfo] = useState(() => ({
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
    anonPrefix: (import.meta.env.VITE_SUPABASE_ANON_KEY || "").slice(0, 10) + "…",
  }));
  const [session, setSession] = useState(null);
  const [rpc, setRpc] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: s } = await supabase.auth.getSession();
      const user = s?.session?.user || null;
      setSession(user ? { id: user.id, email: user.email, aud: user.aud } : null);

      const { data, error: e } = await supabase.rpc("get_my_profile");
      if (e) {
        setRpc(null);
        setError(e.message);
      } else {
        // data puede ser array o objeto (según versión)
        const row = Array.isArray(data) ? data[0] : data;
        setRpc(row || null);
      }
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    run();
    const { data: sub } = supabase.auth.onAuthStateChange(() => run());
    return () => sub.subscription?.unsubscribe?.();
  }, []);

  return (
    <div className="max-w-3xl mx-auto p-4">
      <h1 className="text-xl font-semibold mb-4">WhoAmI (diagnóstico)</h1>

      <section className="mb-4">
        <h2 className="font-medium">Proyecto</h2>
        <pre className="bg-gray-50 p-3 rounded text-sm overflow-auto">
{JSON.stringify(envInfo, null, 2)}
        </pre>
      </section>

      <section className="mb-4">
        <h2 className="font-medium">Sesión</h2>
        <pre className="bg-gray-50 p-3 rounded text-sm overflow-auto">
{JSON.stringify(session, null, 2)}
        </pre>
      </section>

      <section className="mb-4">
        <h2 className="font-medium">RPC get_my_profile</h2>
        <pre className="bg-gray-50 p-3 rounded text-sm overflow-auto">
{JSON.stringify(rpc, null, 2)}
        </pre>
      </section>

      {error && (
        <div className="bg-red-50 text-red-700 p-3 rounded">
          <strong>Error RPC:</strong> {error}
          <p className="text-sm mt-1">
            Si es 401/403, es RLS/permisos del RPC. Revisa GRANT EXECUTE a authenticated y que estés autenticado.
          </p>
        </div>
      )}

      <button
        className="mt-3 border rounded px-3 py-1 hover:bg-gray-50 disabled:opacity-50"
        onClick={run}
        disabled={loading}
      >
        {loading ? "Actualizando…" : "Refrescar"}
      </button>
    </div>
  );
}
