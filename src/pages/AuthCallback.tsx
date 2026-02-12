import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

function safeNextPath(next: string) {
  if (!next) return "/inicio";
  if (next.startsWith("/")) return next;
  return "/inicio";
}

async function apiBootstrap(accessToken: string) {
  const res = await fetch("/api/auth/bootstrap", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    credentials: "include",
    body: JSON.stringify({ access_token: accessToken }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`bootstrap_failed (${res.status}): ${txt || res.statusText}`);
  }
}

export default function AuthCallback() {
  const location = useLocation();
  const navigate = useNavigate();

  const [status, setStatus] = useState("Procesando Magic Link...");

  const next = useMemo(() => {
    const n = new URLSearchParams(location.search).get("next") || "/inicio";
    return safeNextPath(n);
  }, [location.search]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        // 1) Leer hash tokens (implicit flow)
        const hash = window.location.hash || "";
        const hashParams = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);

        const access_token = hashParams.get("access_token") || "";
        const refresh_token = hashParams.get("refresh_token") || "";

        // 2) Si ya hay sesión, úsala
        const { data: existing } = await supabase.auth.getSession();
        let accessToken = existing?.session?.access_token || "";

        if (!accessToken) {
          // 3) Si llegaron tokens por hash, setear sesión en el cliente
          if (!access_token || !refresh_token) {
            throw new Error("missing_access_token_or_refresh_token");
          }

          setStatus("Creando sesión en Supabase...");
          const { data, error } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });
          if (error) throw error;

          accessToken = data?.session?.access_token || "";
          if (!accessToken) throw new Error("no_access_token_after_setSession");
        }

        // 4) Bootstrap cookie tg_at para tu backend
        setStatus("Inicializando cookie de sesión (bootstrap)...");
        await apiBootstrap(accessToken);

        // 5) Limpiar hash para que no quede el token en la URL
        if (!cancelled) {
          const clean = new URL(window.location.href);
          clean.hash = "";
          window.history.replaceState({}, "", clean.toString());
        }

        // 6) Ir al panel
        setStatus("Listo. Entrando...");
        if (!cancelled) navigate(next, { replace: true });
      } catch (e: any) {
        const msg = e?.message || "auth_failed";
        if (!cancelled) navigate(`/login?next=${encodeURIComponent(next)}&err=${encodeURIComponent(msg)}`, { replace: true });
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [navigate, next]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-gray-900">Auth</h1>
        <p className="mt-3 text-sm text-gray-700">{status}</p>
      </div>
    </div>
  );
}
