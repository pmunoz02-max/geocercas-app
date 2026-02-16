import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabaseTracker } from "../lib/supabaseTrackerClient";

function safeNextPath(next) {
  // Permitimos /tracker-gps y /tracker-gps/<ORG_UUID>
  if (!next) return "/tracker-gps";
  if (next.startsWith("/tracker-gps")) return next;
  if (next.startsWith("/")) return next;
  return "/tracker-gps";
}

function buildNextUrl(search) {
  const sp = new URLSearchParams(search || "");
  const next = safeNextPath(sp.get("next") || "/tracker-gps");
  return next;
}

function parseHash(hash) {
  const h = String(hash || "");
  const hp = new URLSearchParams(h.startsWith("#") ? h.slice(1) : h);

  // Tokens (flow viejo)
  const access_token = hp.get("access_token") || "";
  const refresh_token = hp.get("refresh_token") || "";

  // Errores (flow nuevo o link expirado)
  const error = hp.get("error") || "";
  const error_code = hp.get("error_code") || "";
  const error_description = hp.get("error_description") || "";

  return { access_token, refresh_token, error, error_code, error_description };
}

function looksLikeJwt(token) {
  return token && token.split(".").length === 3;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export default function AuthCallbackTracker() {
  const location = useLocation();
  const navigate = useNavigate();

  const nextUrl = useMemo(() => buildNextUrl(location.search), [location.search]);

  const [status, setStatus] = useState("Procesando autenticación de Tracker…");
  const [debug, setDebug] = useState({});
  const [showButton, setShowButton] = useState(false);

  useEffect(() => {
    let alive = true;

    async function run() {
      try {
        if (!supabaseTracker) {
          setStatus("Tracker no configurado en este deployment.");
          setShowButton(true);
          return;
        }

        const parsed = parseHash(window.location.hash);

        setDebug({
          nextUrl,
          hasAccess: !!parsed.access_token,
          hasRefresh: !!parsed.refresh_token,
          error: parsed.error,
          error_code: parsed.error_code,
          error_description: parsed.error_description,
          href: window.location.href,
        });

        // ✅ Caso A: vienen tokens (callback viejo)
        if (parsed.access_token && parsed.refresh_token) {
          setStatus("Creando sesión del tracker…");

          const { error } = await supabaseTracker.auth.setSession({
            access_token: parsed.access_token,
            refresh_token: parsed.refresh_token,
          });

          if (error) {
            setStatus(`Error setSession: ${error.message}`);
            setShowButton(true);
            return;
          }

          // Esperar sesión real
          let session = null;
          for (let i = 0; i < 10; i++) {
            const { data } = await supabaseTracker.auth.getSession();
            session = data?.session || null;
            if (session?.access_token && looksLikeJwt(session.access_token)) break;
            await sleep(150);
          }

          if (!session?.access_token) {
            setStatus("Sesión no persistió. Vuelve a abrir el link.");
            setShowButton(true);
            return;
          }

          // Limpia hash para no repetir
          window.history.replaceState({}, document.title, window.location.pathname + window.location.search);

          setStatus("✅ Sesión OK. Redirigiendo…");
          if (!alive) return;

          navigate(nextUrl, { replace: true });
          return;
        }

        // ✅ Caso B: NO vienen tokens (otp_expired / access_denied / etc.)
        // No nos quedamos aquí. Redirigimos al next directamente.
        const isExpired =
          parsed.error_code === "otp_expired" ||
          String(parsed.error_description || "").toLowerCase().includes("expired") ||
          String(parsed.error_description || "").toLowerCase().includes("invalid");

        if (parsed.error || parsed.error_code || parsed.error_description) {
          setStatus(
            isExpired
              ? "⏳ Este link de acceso expiró o ya fue usado. Redirigiendo…"
              : "⚠️ No se detectaron tokens. Redirigiendo…"
          );
        } else {
          setStatus("No se detectaron tokens en el callback. Redirigiendo…");
        }

        // Limpia hash para evitar loops
        window.history.replaceState({}, document.title, window.location.pathname + window.location.search);

        if (!alive) return;
        // Redirige rápido
        navigate(nextUrl, { replace: true });
      } catch (e) {
        setStatus(`Error: ${String(e?.message || e)}`);
        setShowButton(true);
      }
    }

    run();

    // Si por alguna razón el navigate no ocurre (navegador raro), mostramos botón a los 2s
    const t = setTimeout(() => {
      if (!alive) return;
      setShowButton(true);
    }, 2000);

    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [navigate, nextUrl]);

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-gray-900">Tracker Auth</h1>
        <p className="mt-3 text-sm text-gray-700">{status}</p>

        {showButton && (
          <button
            onClick={() => navigate(nextUrl, { replace: true })}
            className="mt-4 w-full rounded-xl bg-emerald-600 px-4 py-2 text-white font-semibold"
          >
            Continuar
          </button>
        )}

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
