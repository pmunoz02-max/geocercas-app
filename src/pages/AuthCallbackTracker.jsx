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
  return next;
}

function parseHashTokens(hash) {
  const h = String(hash || "");
  const hp = new URLSearchParams(h.startsWith("#") ? h.slice(1) : h);
  return {
    access_token: hp.get("access_token") || "",
    refresh_token: hp.get("refresh_token") || "",
  };
}

function looksLikeJwt(token) {
  return token && token.split(".").length === 3;
}

function readStorageNow() {
  try {
    return localStorage.getItem("sb-tracker-auth");
  } catch {
    return "localStorage_error";
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export default function AuthCallbackTracker() {
  const location = useLocation();
  const navigate = useNavigate();

  const [status, setStatus] = useState("Procesando autenticación de Tracker…");
  const [debug, setDebug] = useState({});
  const [canContinue, setCanContinue] = useState(false);

  const nextUrl = useMemo(() => buildNextUrl("/tracker-gps", location.search), [location.search]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        if (!supabaseTracker) {
          setStatus("Tracker no configurado.");
          return;
        }

        const { access_token, refresh_token } = parseHashTokens(window.location.hash);

        setDebug({
          phase: "start",
          hasAccess: !!access_token,
          storage_before: readStorageNow(),
        });

        if (!access_token || !refresh_token) {
          setStatus("No se detectaron tokens en el callback.");
          return;
        }

        setStatus("Creando sesión desde hash…");

        const { error } = await supabaseTracker.auth.setSession({
          access_token,
          refresh_token,
        });

        if (error) {
          setStatus(`Error setSession: ${error.message}`);
          return;
        }

        // Esperar a que persista en localStorage
        let session = null;
        for (let i = 0; i < 10; i++) {
          const { data } = await supabaseTracker.auth.getSession();
          session = data?.session;
          if (session?.access_token && looksLikeJwt(session.access_token)) break;
          await sleep(200);
        }

        setDebug((d) => ({
          ...d,
          phase: "after_setSession",
          gotSession: !!session,
          storage_after: readStorageNow(),
        }));

        if (!session?.access_token) {
          setStatus("Sesión no persistió.");
          return;
        }

        // Limpia hash
        window.history.replaceState({}, document.title, window.location.pathname + window.location.search);

        setStatus("✅ Sesión OK. Puedes continuar.");
        setCanContinue(true);
      } catch (e) {
        setStatus(`Error: ${e.message}`);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [navigate, nextUrl]);

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-gray-900">Tracker Auth</h1>
        <p className="mt-3 text-sm text-gray-700">{status}</p>

        {canContinue && (
          <button
            onClick={() => navigate(nextUrl, { replace: true })}
            className="mt-4 w-full rounded-xl bg-emerald-600 px-4 py-2 text-white font-semibold"
          >
            Continuar al Tracker
          </button>
        )}

        <details className="mt-4" open>
          <summary className="text-xs text-gray-600 cursor-pointer">Debug</summary>
          <pre className="mt-2 text-[11px] bg-gray-50 border rounded-xl p-3 overflow-auto">
            {JSON.stringify(debug, null, 2)}
          </pre>
        </details>
      </div>
    </div>
  );
}
