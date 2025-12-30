import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/supabaseClient";
import { supabaseTracker } from "@/supabaseTrackerClient";

/**
 * AuthCallback UNIVERSAL (panel + tracker)
 *
 * IMPORTANTÍSIMO:
 * - Los Magic Links generados con supabaseAdmin.auth.admin.generateLink()
 *   NO pueden completar PKCE (?code=...) porque el browser no tiene code_verifier.
 *   => Deben llegar como IMPLICIT: #access_token=...
 *
 * Este callback:
 * - Soporta IMPLICIT (#access_token, refresh_token, expires_at...)
 * - Si llega PKCE (?code=...), muestra mensaje accionable (no bucle infinito).
 * - Decide destino por query param:
 *    /auth/callback?target=panel   -> /inicio
 *    /auth/callback?target=tracker -> /tracker-gps
 */

type Target = "panel" | "tracker";

function getTargetFromUrl(): Target {
  const url = new URL(window.location.href);
  const t = (url.searchParams.get("target") || "").toLowerCase().trim();
  return t === "tracker" ? "tracker" : "panel";
}

function parseHash(hash: string) {
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

function projectRefFromUrl(supabaseUrl: string) {
  try {
    const u = new URL(supabaseUrl);
    const host = u.hostname; // <ref>.supabase.co
    return host.split(".")[0];
  } catch {
    return null;
  }
}

/**
 * Obtiene el user usando el access_token (sin depender de setSession).
 */
async function fetchUserViaRest(supabaseUrl: string, anonKey: string, accessToken: string) {
  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(
      `No se pudo obtener user (/auth/v1/user). Status ${res.status}. ${txt}`.trim()
    );
  }
  return await res.json();
}

/**
 * Guarda sesión en el storage que Supabase espera: sb-<ref>-auth-token
 * Esto permite que tu AuthContext / supabase-js "vea" la sesión al cargar.
 */
function writeSessionToLocalStorage(opts: {
  supabaseUrl: string;
  accessToken: string;
  refreshToken: string;
  expiresAt?: number;
  tokenType?: string;
  user: any;
}) {
  const ref = projectRefFromUrl(opts.supabaseUrl);
  if (!ref) throw new Error("No se pudo derivar project ref del SUPABASE_URL.");

  const key = `sb-${ref}-auth-token`;
  const now = Math.floor(Date.now() / 1000);
  const expires_at = opts.expiresAt && opts.expiresAt > 0 ? opts.expiresAt : now + 3600;

  const payload = {
    access_token: opts.accessToken,
    refresh_token: opts.refreshToken,
    token_type: opts.tokenType || "bearer",
    expires_at,
    expires_in: Math.max(0, expires_at - now),
    user: opts.user,
  };

  localStorage.setItem(key, JSON.stringify(payload));
}

function cleanUrlKeepOriginPath() {
  try {
    const clean = `${window.location.origin}${window.location.pathname}${window.location.search
      .replace(/([?&])code=[^&]+(&|$)/, "$1")
      .replace(/[?&]$/, "")}`;
    // Además, quitamos el hash completo (access_token) para evitar re-procesos.
    window.history.replaceState({}, document.title, clean);
  } catch {
    // noop
  }
}

function redirectAfterLogin(target: Target) {
  // Tracker SIEMPRE a su pantalla; Panel SIEMPRE al panel.
  const dest = target === "tracker" ? "/tracker-gps" : "/inicio";
  window.location.replace(dest);
}

export default function AuthCallback() {
  const [status, setStatus] = useState<string>("Estableciendo sesión...");
  const [error, setError] = useState<string | null>(null);

  const target = useMemo(() => {
    try {
      return getTargetFromUrl();
    } catch {
      return "panel";
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        setError(null);
        setStatus("Estableciendo sesión...");

        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");

        // Elegimos cliente según target (NO por hostname)
        const client = target === "tracker" ? supabaseTracker : supabase;

        // Detectar URL/key
        const SUPABASE_URL =
          (client as any)?.supabaseUrl || import.meta.env.VITE_SUPABASE_URL;
        const ANON_KEY =
          (client as any)?.supabaseKey || import.meta.env.VITE_SUPABASE_ANON_KEY;

        if (!SUPABASE_URL || !ANON_KEY) {
          throw new Error("Faltan SUPABASE_URL o ANON_KEY (env o cliente).");
        }

        // --- CASO PKCE (code=...) ---
        // Esto NO es compatible con generateLink (admin) porque falta code_verifier.
        // En vez de bucle/timeout, damos error claro.
        if (code) {
          cleanUrlKeepOriginPath();
          throw new Error(
            "Este Magic Link llegó en modo PKCE (?code=...), pero los links generados por el servidor (generateLink) no pueden completar PKCE porque falta el code_verifier. Solución: cambia Auth Flow Type a IMPLICIT en Supabase Auth o genera el login desde el cliente (signInWithOtp)."
          );
        }

        // --- CASO IMPLICIT (#access_token=...) ---
        const h = parseHash(window.location.hash);
        if (!h.access_token) {
          cleanUrlKeepOriginPath();
          throw new Error(
            "No se encontró access_token en el callback. Asegura que el Auth Flow Type esté en IMPLICIT y que el redirect sea /auth/callback?target=panel o /auth/callback?target=tracker."
          );
        }

        // OJO: si el reloj del dispositivo está mal, Supabase avisa "issued in the future"
        // y puede fallar. Aviso proactivo:
        setStatus("Validando usuario...");
        const user = await fetchUserViaRest(SUPABASE_URL, ANON_KEY, h.access_token);

        if (!user?.id) {
          cleanUrlKeepOriginPath();
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
        cleanUrlKeepOriginPath();
        redirectAfterLogin(target);
      } catch (e: any) {
        console.error("[AuthCallback] error:", e);
        if (cancelled) return;

        const msg =
          typeof e?.message === "string" && e.message.trim()
            ? e.message.trim()
            : "Error estableciendo sesión.";

        setError(msg);
        setStatus("No se pudo completar el inicio de sesión.");
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [target]);

  return (
    <div className="max-w-xl mx-auto px-4 py-10">
      <div className="border rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">App Geocercas</h1>
        <p className="text-sm text-slate-600 mt-2">{status}</p>

        {error ? (
          <div className="mt-4 text-sm text-red-600">
            {error}

            <div className="mt-4 text-xs text-slate-600">
              Tip: si el link viene de WhatsApp/FB, evita abrirlo en “preview”.
              Usa “Abrir en navegador”. Y revisa que el reloj del teléfono/PC esté
              en hora automática.
            </div>

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
