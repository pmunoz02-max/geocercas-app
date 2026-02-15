import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabaseTracker } from "../lib/supabaseTrackerClient";

function safeNextPath(next) {
  if (!next) return "/tracker-gps";
  if (next.startsWith("/")) return next;
  return "/tracker-gps";
}

function buildNextUrl(defaultNextPath, search) {
  const sp = new URLSearchParams(search || "");
  const next = safeNextPath(sp.get("next") || defaultNextPath || "/tracker-gps");

  const preserve = new URLSearchParams();
  const org = sp.get("org");
  const org_id = sp.get("org_id");
  const orgId = sp.get("orgId");

  if (org) preserve.set("org", org);
  else if (org_id) preserve.set("org", org_id);
  else if (orgId) preserve.set("org", orgId);

  const qs = preserve.toString();
  return qs ? `${next}?${qs}` : next;
}

function parseHashTokens(hash) {
  const h = String(hash || "");
  const hp = new URLSearchParams(h.startsWith("#") ? h.slice(1) : h);
  return {
    access_token: hp.get("access_token") || "",
    refresh_token: hp.get("refresh_token") || "",
    type: hp.get("type") || "",
    expires_in: hp.get("expires_in") || "",
  };
}

export default function AuthCallbackTracker() {
  const location = useLocation();
  const navigate = useNavigate();

  const [status, setStatus] = useState("Procesando autenticación de Tracker…");
  const [debug, setDebug] = useState({});

  const nextUrl = useMemo(() => buildNextUrl("/tracker-gps", location.search), [location.search]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        if (!supabaseTracker) {
          setStatus(
            "Tracker no configurado en este deployment. Falta VITE_SUPABASE_TRACKER_URL/ANON_KEY en Vercel (Preview)."
          );
          setDebug({
            hint: "supabaseTracker is null",
          });
          return;
        }

        const fullUrl = window.location.href;
        const u = new URL(fullUrl);
        const code = u.searchParams.get("code") || "";
        const { access_token, refresh_token } = parseHashTokens(window.location.hash || "");

        setDebug((d) => ({
          ...d,
          nextUrl,
          hasCode: !!code,
          hasHashTokens: !!(access_token && refresh_token),
          path: u.pathname,
          search: u.search,
          hashPresent: !!window.location.hash,
          storageKey: "sb-tracker-auth",
          storageValuePresent: (() => {
            try {
              return !!localStorage.getItem("sb-tracker-auth");
            } catch {
              return "localStorage_error";
            }
          })(),
        }));

        // 1) Intercambiar code -> session
        if (code) {
          setStatus("Intercambiando code por sesión (Tracker)…");
          const { error } = await supabaseTracker.auth.exchangeCodeForSession(fullUrl);
          if (error) throw error;
        }
        // 2) Si viene por hash -> setSession
        else if (access_token && refresh_token) {
          setStatus("Creando sesión desde hash (Tracker)…");
          const { error } = await supabaseTracker.auth.setSession({ access_token, refresh_token });
          if (error) throw error;
        } else {
          setStatus("No hay code ni tokens en el callback.");
          setDebug((d) => ({
            ...d,
            error: "missing_code_and_tokens",
            hint: "El redirectTo del magic link debe apuntar a /auth/callback-tracker?...",
          }));
          return;
        }

        // 3) Confirmar que la sesión quedó realmente creada y persistida
        setStatus("Validando sesión creada…");
        const { data, error } = await supabaseTracker.auth.getSession();
        if (error) throw error;

        const tokenB = data?.session?.access_token || "";
        if (!tokenB || tokenB.split(".").length !== 3) {
          setStatus("Sesión inválida (sin access_token).");
          setDebug((d) => ({
            ...d,
            gotSession: !!data?.session,
            hasAccessToken: !!tokenB,
            storageValueAfter: (() => {
              try {
                return localStorage.getItem("sb-tracker-auth");
              } catch {
                return "localStorage_error";
              }
            })(),
            hint: "La sesión no se persistió. Revisa supabaseTrackerClient y el redirect del magic link.",
          }));
          return;
        }

        // 4) Limpia hash DESPUÉS de tener sesión OK (no toca querystring org/next)
        if (!cancelled) {
          const clean = new URL(window.location.href);
          clean.hash = "";
          window.history.replaceState({}, "", clean.toString());
        }

        setStatus("Sesión OK. Redirigiendo al Tracker…");
        if (!cancelled) navigate(nextUrl, { replace: true });
      } catch (e) {
        const msg = e?.message || String(e);
        setStatus(`Error: ${msg}`);
        setDebug((d) => ({
          ...d,
          exception: msg,
          storageValueAfterError: (() => {
            try {
              return localStorage.getItem("sb-tracker-auth");
            } catch {
              return "localStorage_error";
            }
          })(),
        }));
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [navigate, nextUrl]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-gray-900">Tracker Auth</h1>
        <p className="mt-3 text-sm text-gray-700">{status}</p>
        <p className="mt-2 text-xs text-gray-500 break-all">next: {nextUrl}</p>

        <details className="mt-4">
          <summary className="text-xs text-gray-600 cursor-pointer">Debug</summary>
          <pre className="mt-2 text-[11px] bg-gray-50 border rounded-xl p-3 overflow-auto">
            {JSON.stringify(debug, null, 2)}
          </pre>
        </details>
      </div>
    </div>
  );
}
