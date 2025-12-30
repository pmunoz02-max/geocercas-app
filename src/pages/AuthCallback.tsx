import React, { useEffect, useState } from "react";
import { supabase } from "@/supabaseClient";
import { supabaseTracker } from "@/supabaseTrackerClient";

/**
 * AuthCallback UNIVERSAL (anti-cuelgue):
 * - Soporta PKCE (?code=...) usando exchangeCodeForSession (si existe)
 * - Para implicit (#access_token=...): NO usa setSession (porque cuelga)
 *   -> guarda sesión manualmente en localStorage con key sb-<ref>-auth-token
 * - Redirige por hostname:
 *     www.*     -> /inicio
 *     tracker.* -> /tracker-gps
 */

function isTrackerHostname(hostname) {
  const h = String(hostname || "").toLowerCase().trim();
  return h === "tracker.tugeocercas.com" || h.startsWith("tracker.");
}

function parseHash(hash) {
  if (!hash) return {};
  const clean = hash.startsWith("#") ? hash.slice(1) : hash;
  const p = new URLSearchParams(clean);
  return {
    access_token: p.get("access_token") || "",
    refresh_token: p.get("refresh_token") || "",
    expires_at: Number(p.get("expires_at") || 0) || 0,
    expires_in: Number(p.get("expires_in") || 0) || 0,
    token_type: p.get("token_type") || "bearer",
    type: p.get("type") || "",
  };
}

function projectRefFromUrl(supabaseUrl) {
  try {
    const u = new URL(supabaseUrl);
    const host = u.hostname; // <ref>.supabase.co
    return host.split(".")[0];
  } catch {
    return null;
  }
}

async function fetchUserViaRest(supabaseUrl, anonKey, accessToken) {
  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`No se pudo obtener user (/auth/v1/user). Status ${res.status}. ${txt}`);
  }
  return await res.json();
}

function writeSessionToLocalStorage({ supabaseUrl, accessToken, refreshToken, expiresAt, tokenType, user }) {
  const ref = projectRefFromUrl(supabaseUrl);
  if (!ref) throw new Error("No se pudo derivar project ref del SUPABASE_URL.");

  const key = `sb-${ref}-auth-token`;

  const payload = {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: tokenType || "bearer",
    expires_at: expiresAt || Math.floor(Date.now() / 1000) + 3600,
    expires_in: expiresAt ? Math.max(0, expiresAt - Math.floor(Date.now() / 1000)) : 3600,
    user,
  };

  localStorage.setItem(key, JSON.stringify(payload));
}

export default function AuthCallback() {
  const [status, setStatus] = useState("Estableciendo sesión...");
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const cleanUrl = () => {
      try {
        const clean = `${window.location.origin}${window.location.pathname}`;
        window.history.replaceState({}, document.title, clean);
      } catch {}
    };

    const run = async () => {
      try {
        setError(null);
        setStatus("Estableciendo sesión...");

        const trackerDomain = isTrackerHostname(window.location.hostname);
        const client = trackerDomain ? supabaseTracker : supabase;

        // Intentar obtener URL y key desde el client (v2 suele tener supabaseUrl/supabaseKey)
        const SUPABASE_URL = client?.supabaseUrl || import.meta.env.VITE_SUPABASE_URL;
        const ANON_KEY = client?.supabaseKey || import.meta.env.VITE_SUPABASE_ANON_KEY;

        if (!SUPABASE_URL || !ANON_KEY) {
          throw new Error("Faltan SUPABASE_URL o ANON_KEY (env o cliente).");
        }

        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");

        // 1) PKCE (si viene code)
        if (code && client?.auth?.exchangeCodeForSession) {
          setStatus("Confirmando Magic Link...");
          const { error: exErr } = await client.auth.exchangeCodeForSession(code);
          if (exErr) throw exErr;

          // Si exchange funcionó, limpiamos URL y redirigimos
          setStatus("Redirigiendo...");
          cleanUrl();
          window.location.replace(trackerDomain ? "/tracker-gps" : "/inicio");
          return;
        }

        // 2) IMPLICIT (hash)
        const h = parseHash(window.location.hash);

        if (!h.access_token) {
          throw new Error("No se encontró access_token en el callback.");
        }

        setStatus("Validando usuario...");
        const user = await fetchUserViaRest(SUPABASE_URL, ANON_KEY, h.access_token);

        if (!user?.id) {
          throw new Error("No se pudo validar el usuario con el access_token.");
        }

        setStatus("Guardando sesión...");
        writeSessionToLocalStorage({
          supabaseUrl: SUPABASE_URL,
          accessToken: h.access_token,
          refreshToken: h.refresh_token,
          expiresAt: h.expires_at,
          tokenType: h.token_type,
          user,
        });

        if (cancelled) return;

        setStatus("Redirigiendo...");
        cleanUrl();

        // IMPORTANTE: redirigir según dominio
        window.location.replace(trackerDomain ? "/tracker-gps" : "/inicio");
      } catch (e) {
        console.error("[AuthCallback] error:", e);
        if (cancelled) return;
        setError(e?.message || "Error estableciendo sesión.");
        setStatus("No se pudo completar el inicio de sesión.");
        // limpieza por seguridad
        try {
          const clean = `${window.location.origin}${window.location.pathname}`;
          window.history.replaceState({}, document.title, clean);
        } catch {}
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="max-w-xl mx-auto px-4 py-10">
      <div className="border rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">App Geocercas</h1>
        <p className="text-sm text-slate-600 mt-2">{status}</p>

        {error ? (
          <div className="mt-4 text-sm text-red-600">
            {error}
            <div className="mt-3 flex gap-2">
              <button
                className="border rounded px-3 py-2 text-xs"
                onClick={() => window.location.replace("/login")}
              >
                Ir a Login
              </button>
              <button
                className="border rounded px-3 py-2 text-xs"
                onClick={() => window.location.reload()}
              >
                Reintentar
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
