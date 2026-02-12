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
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`bootstrap_failed (${res.status}): ${txt || res.statusText}`);
  }
}

export default function AuthCallback() {
  const location = useLocation();
  const navigate = useNavigate();

  const [status, setStatus] = useState("Iniciando callback...");
  const [debug, setDebug] = useState<any>(null);
  const [error, setError] = useState<string>("");

  const next = useMemo(() => {
    const n = new URLSearchParams(location.search).get("next") || "/inicio";
    return safeNextPath(n);
  }, [location.search]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code") || "";

        const hash = window.location.hash || "";
        const hashParams = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
        const hashAccessToken = hashParams.get("access_token") || "";
        const queryAccessToken = url.searchParams.get("access_token") || "";

        // sesión actual en el browser (por si Supabase ya la seteo)
        const { data: sessionData } = await supabase.auth.getSession();
        const sessionAccessToken = sessionData?.session?.access_token || "";

        const dbg = {
          href: window.location.href,
          origin: window.location.origin,
          pathname: url.pathname,
          search: url.search,
          hash,
          next,
          found: {
            code,
            hashAccessToken: !!hashAccessToken,
            queryAccessToken: !!queryAccessToken,
            sessionAccessToken: !!sessionAccessToken,
          },
        };

        if (!cancelled) setDebug(dbg);

        // Intento de login en orden:
        // 1) Si ya hay sesión, bootstrap y listo
        if (sessionAccessToken) {
          setStatus("Sesión ya existe en navegador. Haciendo bootstrap...");
          await apiBootstrap(sessionAccessToken);
          setStatus("OK. Redirigiendo...");
          navigate(next, { replace: true });
          return;
        }

        // 2) Si llegó code, exchange + bootstrap
        if (code) {
          setStatus("Llegó code. Haciendo exchangeCodeForSession...");
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;

          const at = data?.session?.access_token || "";
          if (!at) throw new Error("no_access_token_after_exchange");

          setStatus("Exchange OK. Haciendo bootstrap...");
          await apiBootstrap(at);

          setStatus("OK. Redirigiendo...");
          navigate(next, { replace: true });
          return;
        }

        // 3) Si llegó access_token por hash/query (legacy), bootstrap
        const accessToken = hashAccessToken || queryAccessToken;
        if (accessToken) {
          setStatus("Llegó access_token (legacy). Haciendo bootstrap...");
          await apiBootstrap(accessToken);
          setStatus("OK. Redirigiendo...");
          navigate(next, { replace: true });
          return;
        }

        // 4) Si no llegó nada, NO redirijo automáticamente (para ver debug)
        setStatus("No llegó code ni token ni sesión. Revisa Debug abajo.");
        setError("missing_code_and_token_and_session");
      } catch (e: any) {
        const msg = e?.message || "auth_callback_failed";
        setStatus("Error en callback");
        setError(msg);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [navigate, next, location.search]);

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6">
      <div className="w-full max-w-2xl rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Auth Callback (Debug)</h1>
        <p className="mt-3 text-sm">{status}</p>

        {error ? (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="mt-5">
          <h2 className="text-sm font-semibold">Debug</h2>
          <pre className="mt-2 whitespace-pre-wrap rounded-xl border bg-gray-50 p-3 text-xs text-gray-700">
            {JSON.stringify(debug, null, 2)}
          </pre>
        </div>

        <div className="mt-5 flex gap-2">
          <button
            className="rounded-xl border px-4 py-2"
            onClick={() => navigate(`/login?next=${encodeURIComponent(next)}`, { replace: true })}
          >
            Ir a Login
          </button>
          <button
            className="rounded-xl bg-black px-4 py-2 text-white"
            onClick={() => navigate(next, { replace: true })}
          >
            Ir a {next}
          </button>
        </div>
      </div>
    </div>
  );
}
