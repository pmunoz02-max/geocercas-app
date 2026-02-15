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

function looksLikeJwt(token) {
  const t = String(token || "");
  return t.split(".").length === 3;
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
          setStatus("Tracker no configurado en este deployment (faltan envs).");
          setDebug({ hint: "supabaseTracker is null" });
          return;
        }

        const fullUrl = window.location.href;
        const u = new URL(fullUrl);
        const code = u.searchParams.get("code") || "";
        const hasHash = !!(window.location.hash || "").trim();

        setDebug((d) => ({
          ...d,
          phase: "start",
          nextUrl,
          href: fullUrl,
          path: u.pathname,
          search: u.search,
          hash: hasHash ? "(present)" : "(empty)",
          hasCode: !!code,
          storage_before: readStorageNow(),
          note:
            "En este callback NO hacemos exchangeCodeForSession ni setSession. detectSessionInUrl=true debe persistir sesión automáticamente.",
        }));

        // Limpia hash para evitar loops visuales y para que el usuario no re-procese tokens al refrescar.
        // (No borra el ?code=... porque Supabase maneja eso internamente)
        if (hasHash) {
          try {
            history.replaceState(null, "", `${u.pathname}${u.search}`);
          } catch {}
        }

        setStatus("Esperando a que Supabase detecte y persista la sesión…");

        // Espera corta con reintentos: algunos navegadores tardan un poco en persistir.
        // Total ~2.5s, suficiente sin hacer “parches”.
        let session = null;
        let lastErr = null;

        for (let i = 0; i < 10; i++) {
          if (cancelled) return;

          const { data, error } = await supabaseTracker.auth.getSession();
          lastErr = error ?? null;
          session = data?.session ?? null;

          if (session?.access_token && looksLikeJwt(session.access_token)) break;
          await sleep(250);
        }

        setDebug((d) => ({
          ...d,
          phase: "after_wait",
          gotSession: !!session,
          tokenLooksOk: looksLikeJwt(session?.access_token || ""),
          storage_after: readStorageNow(),
          lastErr: lastErr?.message || null,
        }));

        if (!session?.access_token || !looksLikeJwt(session.access_token)) {
          setStatus("No se detectó una sesión persistida. Abre un Magic Link NUEVO.");
          setCanContinue(false);
          return;
        }

        setStatus("✅ Sesión OK (persistida). Puedes continuar al Tracker.");
        setCanContinue(true);

        // Si quieres redirección automática, descomenta:
        // navigate(nextUrl, { replace: true });
      } catch (e) {
        const msg = e?.message || String(e);
        setStatus(`Error: ${msg}`);
        setDebug((d) => ({
          ...d,
          phase: "exception",
          exception: msg,
          storage_after_error: readStorageNow(),
        }));
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [nextUrl, navigate]);

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-gray-900">Tracker Auth</h1>
        <p className="mt-3 text-sm text-gray-700">{status}</p>

        <p className="mt-2 text-xs text-gray-500 break-all">next: {nextUrl}</p>
        <p className="mt-2 text-xs text-gray-500 break-all">storageKey: sb-tracker-auth</p>

        {canContinue ? (
          <button
            onClick={() => navigate(nextUrl, { replace: true })}
            className="mt-4 w-full rounded-xl bg-emerald-600 px-4 py-2 text-white font-semibold"
          >
            Continuar al Tracker
          </button>
        ) : null}

        <details className="mt-4" open>
          <summary className="text-xs text-gray-600 cursor-pointer">Debug (copia/pega)</summary>
          <pre className="mt-2 text-[11px] bg-gray-50 border rounded-xl p-3 overflow-auto">
            {JSON.stringify(debug, null, 2)}
          </pre>
        </details>
      </div>
    </div>
  );
}
