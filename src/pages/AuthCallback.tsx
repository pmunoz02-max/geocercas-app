import React, { useEffect, useState } from "react";

/**
 * AuthCallback UNIVERSAL (admins/panel + trackers):
 * - Soporta PKCE (?code=...) sin usar exchangeCodeForSession del SDK (evita cuelgues)
 * - Soporta implicit (#access_token=...) también
 * - Escribe sesión en la storageKey REAL usada por tus clientes (panel/tracker)
 * - Redirige por dominio:
 *     tracker.* -> /tracker-gps
 *     resto     -> /inicio
 */

function isTrackerHost() {
  const h = String(window.location.hostname || "").toLowerCase().trim();
  return h === "tracker.tugeocercas.com" || h.startsWith("tracker.");
}

function cleanUrlKeepPath() {
  try {
    const clean = `${window.location.origin}${window.location.pathname}`;
    window.history.replaceState({}, document.title, clean);
  } catch {}
}

function parseHash(hash: string) {
  const clean = hash?.startsWith("#") ? hash.slice(1) : hash;
  const p = new URLSearchParams(clean || "");
  return {
    access_token: p.get("access_token") || "",
    refresh_token: p.get("refresh_token") || "",
    expires_at: Number(p.get("expires_at") || 0) || 0,
    token_type: p.get("token_type") || "bearer",
    type: p.get("type") || "",
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string) {
  let t: any;
  const timeout = new Promise<T>((_, reject) => {
    t = setTimeout(() => reject(new Error(`Timeout en ${label}`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

/**
 * Intercambio PKCE por REST (evita SDK colgado).
 * Nota: Supabase acepta "auth_code" para PKCE en /token.
 */
async function exchangePkceByRest(supabaseUrl: string, anonKey: string, code: string) {
  const url = `${supabaseUrl}/auth/v1/token?grant_type=pkce`;

  // Supabase Auth espera form-urlencoded para /token
  const body = new URLSearchParams();
  body.set("auth_code", code);

  const res = await withTimeout(
    fetch(url, {
      method: "POST",
      headers: {
        apikey: anonKey,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    }),
    12000,
    "fetch /auth/v1/token"
  );

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Error intercambiando code (token). Status ${res.status}. ${txt}`);
  }

  const data = await res.json();

  // Esperado: access_token, refresh_token, expires_in, expires_at, token_type, user
  if (!data?.access_token || !data?.refresh_token) {
    throw new Error("Respuesta inválida del token endpoint (faltan tokens).");
  }
  return data;
}

async function fetchUserByRest(supabaseUrl: string, anonKey: string, accessToken: string) {
  const res = await withTimeout(
    fetch(`${supabaseUrl}/auth/v1/user`, {
      method: "GET",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
      },
    }),
    12000,
    "fetch /auth/v1/user"
  );

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`No se pudo obtener user. Status ${res.status}. ${txt}`);
  }
  return await res.json();
}

/**
 * Escribe sesión en la key correcta.
 * IMPORTANTE: debe coincidir con la storageKey configurada en tus clients.
 */
function writeSession(storageKey: string, session: any) {
  localStorage.setItem(storageKey, JSON.stringify(session));
}

export default function AuthCallback() {
  const [status, setStatus] = useState("Procesando Magic Link...");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        setError(null);

        const tracker = isTrackerHost();

        // ✅ Usa las env vars correctas según dominio
        const SUPABASE_URL = tracker
          ? import.meta.env.VITE_TRACKER_SUPABASE_URL
          : import.meta.env.VITE_SUPABASE_URL;

        const ANON_KEY = tracker
          ? import.meta.env.VITE_TRACKER_SUPABASE_ANON_KEY
          : import.meta.env.VITE_SUPABASE_ANON_KEY;

        if (!SUPABASE_URL || !ANON_KEY) {
          throw new Error("Faltan env vars Supabase para este dominio.");
        }

        // ✅ storageKey REAL (debe igualar la de tus clients)
        const STORAGE_KEY = tracker
          ? "sb-tugeocercas-auth-token-tracker-authB"
          : "sb-tugeocercas-auth-token-panel-authA";

        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");

        // 1) PKCE: callback?code=...
        if (code) {
          setStatus("Confirmando acceso...");

          const tokenData = await exchangePkceByRest(SUPABASE_URL, ANON_KEY, code);

          // tokenData ya suele traer user; si no, lo pedimos
          const user = tokenData.user?.id
            ? tokenData.user
            : await fetchUserByRest(SUPABASE_URL, ANON_KEY, tokenData.access_token);

          const expiresAt =
            Number(tokenData.expires_at) ||
            Math.floor(Date.now() / 1000) + Number(tokenData.expires_in || 3600);

          const sessionPayload = {
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            token_type: tokenData.token_type || "bearer",
            expires_at: expiresAt,
            expires_in: Number(tokenData.expires_in || 3600),
            user,
          };

          writeSession(STORAGE_KEY, sessionPayload);
          cleanUrlKeepPath();

          if (cancelled) return;
          setStatus("Redirigiendo...");

          window.location.replace(tracker ? "/tracker-gps" : "/inicio");
          return;
        }

        // 2) Implicit: callback#access_token=...
        const h = parseHash(window.location.hash);
        if (h.access_token) {
          setStatus("Validando usuario...");
          const user = await fetchUserByRest(SUPABASE_URL, ANON_KEY, h.access_token);

          const expiresAt = h.expires_at || Math.floor(Date.now() / 1000) + 3600;

          const sessionPayload = {
            access_token: h.access_token,
            refresh_token: h.refresh_token,
            token_type: h.token_type || "bearer",
            expires_at: expiresAt,
            expires_in: Math.max(0, expiresAt - Math.floor(Date.now() / 1000)),
            user,
          };

          writeSession(STORAGE_KEY, sessionPayload);
          cleanUrlKeepPath();

          if (cancelled) return;
          setStatus("Redirigiendo...");

          window.location.replace(tracker ? "/tracker-gps" : "/inicio");
          return;
        }

        // 3) Nada útil
        throw new Error(
          "Callback inválido: no llegó code ni access_token. Reenvía el Magic Link."
        );
      } catch (e: any) {
        console.error("[AuthCallback] error:", e);
        if (cancelled) return;
        setError(e?.message || "No se pudo completar el inicio de sesión.");
        setStatus("No se pudo completar el inicio de sesión.");
        cleanUrlKeepPath();
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
