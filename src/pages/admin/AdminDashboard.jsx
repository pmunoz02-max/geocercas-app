import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSupabase } from "../../lib/supabaseClient.js";

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [email, setEmail] = useState(null);
  const [sbError, setSbError] = useState(null);

  let supabase = null;
  try {
    supabase = getSupabase();
  } catch (e) {
    setSbError(String(e?.message || e));
  }

  useEffect(() => {
    let ignore = false;
    if (!supabase) return;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!ignore) setEmail(data?.user?.email ?? null);
    })();
    return () => { ignore = true; };
  }, [supabase]);

  const go = (path) => () => navigate(path);
  const signOut = async () => { if (supabase) await supabase.auth.signOut(); navigate("/", { replace:true }); };

  return (
    <div className="min-h-screen px-6 md:px-12 py-10">
      <header className="flex items-center justify-between mb-8">
        <h1 className="text-3xl md:text-4xl font-extrabold text-blue-700">Panel de Administración</h1>
        {email && <div className="text-sm text-gray-600">{email} — <span className="font-semibold">OWNER</span></div>}
      </header>

      {sbError && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-800 mb-6">
          <div className="font-semibold mb-1">Configuración requerida</div>
          <pre className="whitespace-pre-wrap text-sm">{sbError}</pre>
        </div>
      )}

      <section className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
        <Card title="Geocercas" subtitle="(Módulo original)" onClick={go("/admin/geocercas")} />
        <Card title="Geocercas (V2)" subtitle="Mapa + activar/desactivar" onClick={go("/admin/geocercas-v2")} />
        <Card title="Personal" subtitle="Usuarios, roles y permisos" onClick={go("/admin/personal")} />
        <Card title="Reportes" subtitle="Entradas/salidas, cumplimiento" onClick={go("/admin/reportes")} />
      </section>

      <button type="button" onClick={signOut}
        className="inline-flex items-center gap-2 rounded-lg bg-red-600 text-white px-5 py-3 font-semibold shadow hover:opacity-90">
        Cerrar sesión
      </button>
    </div>
  );
}

function Card({ title, subtitle, onClick }) {
  return (
    <button type="button" onClick={onClick}
      className="text-left w-full rounded-2xl border border-gray-200 bg-white p-6 shadow-sm hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 transition">
      <h3 className="text-lg font-semibold mb-1">{title}</h3>
      <p className="text-sm text-gray-600">{subtitle}</p>
    </button>
  );
}

