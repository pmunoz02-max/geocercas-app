import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

function getQueryParam(search: string, key: string) {
  const v = new URLSearchParams(search).get(key);
  return v ?? "";
}

function safeNextPath(next: string) {
  // Evita open redirect: solo paths internos
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
    body: JSON.stringify({ access_token: accessToken }),
    credentials: "include",
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`bootstrap_failed (${res.status}): ${txt || res.statusText}`);
  }
  return res.json().catch(() => ({}));
}

async function apiSession() {
  const res = await fetch("/api/auth/session", {
    method: "GET",
    credentials: "include",
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`session_failed (${res.status}): ${txt || res.statusText}`);
  }
  return res.json().catch(() => ({}));
}

export default function AuthCallback() {
  const location = useLocation();
  const navigate = useNavigate();

  const [status, setStatus] = useState<string>("Procesando autenticación...");
  const [detail, setDetail] = useState<string>("");

  const next = useMemo(() => {
    const n = getQueryParam(location.search, "next");
    return safeNextPath(n || "/inicio");
  }, [location.search]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        setStatus("Leyendo parámetros de callback...");

        // 1) PKCE: Supabase manda ?code=
        const code = getQueryParam(location.search, "code");

        // 2) Legacy/implicit: tokens en hash o query
        const hash = location.hash || "";
        const hashParams = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
        const hashAccessToken = hashParams.get("access_token") || "";
        const queryAccessToken = getQueryParam(location.search, "access_token");

        let accessToken = hashAccessToken || queryAccessToken;

        if (code) {
          setStatus("Intercambiando code por sesión (PKCE)...");
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;

          const at = data?.session?.access_token || "";
          if (!at) {
            throw new Error("missing_access_token_after_exchange");
          }
          accessToken = at;

          // Limpia la URL (quita ?code=) para que refresh no re-ejecute exchange
          if (!cancelled) {
            const clean = new URL(window.location.href);
            clean.searchParams.delete("code");
            // mantiene next
            window.history.replaceState({}, "", clean.toString());
          }
        }

        if (!accessToken) {
          // Si no hay code ni access_token, no hay nada que bootstraper
          throw new Error("missing_access_token_in_hash_or_query_or_code");
        }

        setStatus("Inicializando sesión en backend (bootstrap cookie tg_at)...");
        await apiBootstrap(accessToken);

        setStatus("Validando sesión (api/auth/session)...");
        await apiSession();

        setStatus("Listo. Redirigiendo...");
        if (!cancelled) navigate(next, { replace: true });
      } catch (e: any) {
        const msg = e?.message || "auth_callback_failed";
        setStatus("Error de autenticación.");
        setDetail(msg);

        // Manda a login con error legible
        if (!cancelled) {
          const qp = new URLSearchParams();
          qp.set("next", next);
          qp.set("err", msg);
          navigate(`/login?${qp.toString()}`, { replace: true });
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [location.search, location.hash, next, navigate]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Auth Callback</h1>
        <p className="mt-4 text-sm">{status}</p>
        {detail ? (
          <pre className="mt-4 whitespace-pre-wrap rounded-xl border bg-gray-50 p-3 text-xs text-gray-700">
            {detail}
          </pre>
        ) : (
          <p className="mt-4 text-xs text-gray-500">
            next: <span className="break-all">{next}</span>
          </p>
        )}
      </div>
    </div>
  );
}
