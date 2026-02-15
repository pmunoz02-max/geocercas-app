// src/pages/AuthCallbackTracker.jsx
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabaseTracker } from "../lib/supabaseTrackerClient";

function safeNextPath(next) {
  if (!next) return "/tracker-gps";
  if (next.startsWith("/")) return next;
  return "/tracker-gps";
}

function extractOrg(search) {
  const sp = new URLSearchParams(search || "");
  return sp.get("org") || sp.get("org_id") || sp.get("orgId") || "";
}

/**
 * Preserva parámetros importantes del callback hacia el destino (tracker-gps):
 * - org / org_id / orgId
 *
 * No copia: next, code, access_token, refresh_token, type, expires_in, etc.
 */
function buildNextUrl(nextPath, search) {
  const sp = new URLSearchParams(search || "");
  const next = safeNextPath(sp.get("next") || nextPath || "/tracker-gps");

  const preserve = new URLSearchParams();
  const org = extractOrg(search);

  if (org) preserve.set("org", org);

  const qs = preserve.toString();
  return qs ? `${next}?${qs}` : next;
}

export default function AuthCallbackTracker() {
  const location = useLocation();
  const navigate = useNavigate();
  const [status, setStatus] = useState("Procesando autenticación de Tracker...");
  const [detail, setDetail] = useState("");

  const orgId = useMemo(() => extractOrg(location.search), [location.search]);

  const nextUrl = useMemo(() => {
    return buildNextUrl("/tracker-gps", location.search);
  }, [location.search]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        if (!supabaseTracker) {
          setStatus(
            "Tracker no configurado en este deployment. Falta VITE_SUPABASE_TRACKER_URL/ANON_KEY en Vercel (Preview)."
          );
          return;
        }

        const url = window.location.href;
        const hasCode = new URL(url).searchParams.get("code");

        if (hasCode) {
          setStatus("Intercambiando code por sesión (Tracker)...");
          const { error } = await supabaseTracker.auth.exchangeCodeForSession(url);
          if (error) throw error;
        } else {
          const hash = window.location.hash || "";
          const hp = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
          const access_token = hp.get("access_token") || "";
          const refresh_token = hp.get("refresh_token") || "";

          if (access_token && refresh_token) {
            setStatus("Creando sesión en Supabase (Tracker)...");
            const { error } = await supabaseTracker.auth.setSession({
              access_token,
              refresh_token,
            });
            if (error) throw error;
          }
        }

        // Limpia hash (no toca querystring, porque ahí viaja org/next)
        if (!cancelled) {
          const clean = new URL(window.location.href);
          clean.hash = "";
          window.history.replaceState({}, "", clean.toString());
        }

        // ✅ Paso nuevo: aceptar invite y crear membership real (solo si hay orgId)
        if (orgId) {
          setStatus("Validando invitación y activando Tracker en la org...");
          const { data, error } = await supabaseTracker.functions.invoke("accept-tracker-invite", {
            body: { org_id: orgId },
          });

          if (error) {
            // En Preview dejamos diagnóstico visible
            setDetail(`accept-tracker-invite error: ${error.message}`);
          } else {
            setDetail(`accept-tracker-invite ok: ${JSON.stringify(data)}`);
          }
        } else {
          setDetail("Warning: no orgId en querystring; no se ejecutó accept-tracker-invite.");
        }

        setStatus("Listo. Entrando al Tracker...");
        if (!cancelled) navigate(nextUrl, { replace: true });
      } catch (e) {
        const msg = e?.message || "tracker_auth_failed";
        setStatus(`Error: ${msg}`);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [navigate, nextUrl, orgId]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-gray-900">Tracker Auth</h1>
        <p className="mt-3 text-sm text-gray-700">{status}</p>

        <p className="mt-2 text-xs text-gray-500 break-all">
          org: {orgId || "(none)"} <br />
          next: {nextUrl}
        </p>

        {detail ? (
          <pre className="mt-3 text-[11px] leading-snug p-2 rounded-lg bg-gray-50 border overflow-auto max-h-40">
            {detail}
          </pre>
        ) : null}
      </div>
    </div>
  );
}
