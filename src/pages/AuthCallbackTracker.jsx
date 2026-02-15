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
        const { access_token, refresh_token } = parseHashTokens(window.location.hash || "");

        setDebug((d) => ({
          ...d,
          phase: "start",
          nextUrl,
          href: fullUrl,
          path: u.pathname,
          search: u.search,
          hash: window.location.hash ? "(present)" : "(empty)",
          hasCode: !!code,
          hasHashTokens: !!(access_token && refresh_token),
          storage_before: readStorageNow(),
        }));

        if (code) {
          setStatus("Intercambiando code por sesión (Tracker)…");
          const { error } = await supabaseTracker.auth.exchangeCodeForSession(fullUrl);
          if (error) throw error;
        } else if (access_token && refresh_token) {
          setStatus("Creando sesión desde hash (Tracker)…");
          const { error } = await supabaseTracker.auth.setSession({ access_token, refresh_token });
          if (error) throw error;
        } else {
          setStatus("No hay code ni tokens en el callback.");
          setDebug((d) => ({
            ...d,
            phase: "missing_code_and_tokens",
            storage_after: readStorageNow(),
            hint:
              "El redirect_to del magic link NO llegó a /auth/callback-tracker con code/tokens. Revisa allowlist de Redirect URLs en Supabase Auth.",
          }));
          return;
        }

        setStatus("Validando sesión creada…");
        const { data, error } = await supabaseTracker.auth.getSession();
        if (error) throw error;

        const token = data?.session?.access_token || "";

        setDebug((d) => ({
          ...d,
          phase: "after_exchange",
          gotSession: !!data?.session,
          tokenLooksOk: looksLikeJwt(token),
          storage_after: readStorageNow(),
        }));

        if (!token || !looksLikeJwt(token)) {
          setStatus("Sesión NO quedó válida (sin access_token).");
          setCanContinue(false);
          return;
        }

        setStatus("✅ Sesión OK. Puedes continuar al Tracker.");
        setCanContinue(true);

        // IMPORTANT: NO redirigimos automáticamente (pausa para debug)
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
  }, [navigate, nextUrl]);

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
