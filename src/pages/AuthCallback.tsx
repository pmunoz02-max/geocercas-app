// src/pages/AuthCallback.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import { supabaseTracker } from "../supabaseTrackerClient";

type StatusStep =
  | "init"
  | "parsing"
  | "exchanging"
  | "validating"
  | "saving"
  | "checking"
  | "redirecting"
  | "error";

function isTrackerHostname(hostname: string) {
  const h = String(hostname || "").toLowerCase().trim();
  return h === "tracker.tugeocercas.com" || h.startsWith("tracker.");
}

function parseHash(hash: string) {
  if (!hash) return {};
  const clean = hash.startsWith("#") ? hash.slice(1) : hash;
  const p = new URLSearchParams(clean);
  return {
    access_token: p.get("access_token") || "",
    refresh_token: p.get("refresh_token") || "",
    expires_at: Number(p.get("expires_at") || 0) || 0,
    token_type: p.get("token_type") || "bearer",
    type: p.get("type") || "",
  };
}

function projectRefFromUrl(supabaseUrl: string) {
  try {
    const u = new URL(supabaseUrl);
    return u.hostname.split(".")[0] || null; // <ref>.supabase.co
  } catch {
    return null;
  }
}

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
      `No se pudo obtener user (/auth/v1/user). Status ${res.status}. ${txt}`.slice(0, 600)
    );
  }
  return await res.json();
}

function safeJsonParse<T = any>(s: string | null): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string) {
  let t: any;
  const timeout = new Promise<T>((_, reject) => {
    t = setTimeout(() => reject(new Error(`Timeout en ${label}`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

function writeSessionToStorage(storageKey: string, payload: any) {
  localStorage.setItem(storageKey, JSON.stringify(payload));
}

function buildSessionPayload(params: {
  accessToken: string;
  refreshToken: string;
  expiresAt?: number;
  tokenType?: string;
  user: any;
}) {
  const now = Math.floor(Date.now() / 1000);
  const expires_at = params.expiresAt && params.expiresAt > 0 ? params.expiresAt : now + 3600;

  return {
    access_token: params.accessToken,
    refresh_token: params.refreshToken,
    token_type: params.tokenType || "bearer",
    expires_at,
    expires_in: Math.max(0, expires_at - now),
    user: params.user,
  };
}

export default function AuthCallback() {
  const trackerDomain = useMemo(() => isTrackerHostname(window.location.hostname), []);
  const client = trackerDomain ? supabaseTracker : supabase;

  // Estos storageKey deben coincidir con tus createClient()
  const STORAGE_KEY_PANEL = "sb-tugeocercas-auth-token-panel-authA";
  const STORAGE_KEY_TRACKER = "sb-tugeocercas-auth-token-tracker-authB";

  const storageKey = trackerDomain ? STORAGE_KEY_TRACKER : STORAGE_KEY_PANEL;

  const [step, setStep] = useState<StatusStep>("init");
  const [status, setStatus] = useState<string>("Iniciando...");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    // Debug universal (para consola)
    (window as any).__SUPABASE_AUTH_DEBUG = {
      getSession: async () => {
        try {
          const { data, error } = await client.auth.getSession();
          return { data, error };
        } catch (e: any) {
          return { error: e?.message || String(e) };
        }
      },
      storageKey,
      trackerDomain,
    };
  }, [client, storageKey, trackerDomain]);

  useEffect(() => {
    let cancelled = false;

    const cleanUrl = () => {
      try {
        const clean = `${window.location.origin}${window.location.pathname}`;
        window.history.replaceState({}, document.title, clean);
      } catch {
        // ignore
      }
    };

    const hardRedirect = (to: string) => {
      // hard redirect para asegurar que AuthContext re-hidrate desde localStorage
      window.location.replace(to);
    };

    const run = async () => {
      try {
        setError("");
        setStep("parsing");
        setStatus("Confirmando acceso...");

        const url = new URL(window.location.href);
        const code = url.searchParams.get("code") || "";

        const h = parseHash(window.location.hash || "");
        const hasTokens = Boolean(h.access_token);

        // Resolver URL/KEY (por si se requiere REST)
        const SUPABASE_URL =
          (client as any)?.supabaseUrl || (import.meta as any).env?.VITE_SUPABASE_URL || "";
        const ANON_KEY =
          (client as any)?.supabaseKey || (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || "";

        // 1) Si viene con code=... intentamos exchange (pero con timeout para evitar cuelgue)
        if (code) {
          setStep("exchanging");
          setStatus("Intercambiando código de acceso...");

          if (typeof (client as any)?.auth?.exchangeCodeForSession === "function") {
            // Nota: si Supabase exige code_verifier y no existe, puede fallar.
            const res = await withTimeout(
              (client as any).auth.exchangeCodeForSession(code),
              12000,
              "exchangeCodeForSession"
            );

            if (res?.error) {
              // Si falló, NO entramos en bucle: caemos a modo hash si existe; si no, error claro.
              if (!hasTokens) {
                throw new Error(
                  `No se pudo completar el inicio de sesión con code. ${res.error?.message || ""}`.trim()
                );
              }
            } else {
              // Exchange OK. Verificamos sesión y redirigimos.
              setStep("checking");
              setStatus("Verificando sesión...");
              const sessionCheck = await withTimeout(client.auth.getSession(), 12000, "getSession");

              if (sessionCheck?.error) {
                throw new Error(sessionCheck.error.message || "No se pudo verificar la sesión.");
              }
              const sess = sessionCheck?.data?.session;
              if (!sess) {
                throw new Error("Sesión no disponible después del intercambio de código.");
              }

              cleanUrl();
              setStep("redirecting");
              setStatus("Redirigiendo...");
              if (cancelled) return;
              hardRedirect(trackerDomain ? "/tracker-gps" : "/inicio");
              return;
            }
          } else {
            // Si el SDK no tiene exchangeCodeForSession, seguimos con hash si existe.
            if (!hasTokens) {
              throw new Error("El cliente auth no soporta exchangeCodeForSession y no hay tokens en URL.");
            }
          }
        }

        // 2) Modo hash (#access_token=...)
        if (!hasTokens) {
          // Caso típico de WhatsApp/preview: pierden el hash => sin tokens.
          // Mostramos error claro y sin bucle.
          throw new Error(
            "No llegaron tokens en el link (access_token). Si lo abriste desde una previsualización (WhatsApp/FB), toca “Abrir en navegador” (Chrome/Safari) y usa el Magic Link original."
          );
        }

        if (!SUPABASE_URL || !ANON_KEY) {
          throw new Error("Faltan SUPABASE_URL o ANON_KEY para validar usuario.");
        }

        setStep("validating");
        setStatus("Validando usuario...");
        const user = await withTimeout(fetchUserViaRest(SUPABASE_URL, ANON_KEY, h.access_token), 12000, "fetchUser");

        if (!user?.id) {
          throw new Error("No se pudo validar el usuario con el access_token.");
        }

        setStep("saving");
        setStatus("Guardando sesión...");

        const sessionPayload = buildSessionPayload({
          accessToken: h.access_token,
          refreshToken: h.refresh_token || "",
          expiresAt: h.expires_at,
          tokenType: h.token_type,
          user,
        });

        // Guardamos en TU storageKey (panel/tracker)
        writeSessionToStorage(storageKey, sessionPayload);

        // (Opcional) también guardamos en el storage default de Supabase por compatibilidad (no hace daño)
        const ref = projectRefFromUrl(SUPABASE_URL);
        if (ref) {
          writeSessionToStorage(`sb-${ref}-auth-token`, sessionPayload);
        }

        // Intento best-effort de setear sesión en memoria (si cuelga, lo ignoramos)
        if (typeof (client as any)?.auth?.setSession === "function") {
          try {
            await withTimeout(
              (client as any).auth.setSession({
                access_token: sessionPayload.access_token,
                refresh_token: sessionPayload.refresh_token,
              }),
              6000,
              "setSession"
            );
          } catch {
            // ignorar; el hard redirect re-hidrata desde localStorage
          }
        }

        setStep("checking");
        setStatus("Confirmando sesión...");
        const check = await withTimeout(client.auth.getSession(), 12000, "getSession");

        if (check?.error) {
          throw new Error(check.error.message || "No se pudo confirmar la sesión.");
        }
        if (!check?.data?.session) {
          // A veces el SDK necesita recarga para leer storageKey.
          // No lo tratamos como fatal: redirigimos con hard redirect.
        }

        cleanUrl();
        setStep("redirecting");
        setStatus("Redirigiendo...");
        if (cancelled) return;
        hardRedirect(trackerDomain ? "/tracker-gps" : "/inicio");
      } catch (e: any) {
        console.error("[AuthCallback] error:", e);
        if (cancelled) return;
        setStep("error");
        setStatus("No se pudo completar el inicio de sesión.");
        setError(e?.message || "Error estableciendo sesión.");
        try {
          // Evita bucles por hash/code reintentando con la misma URL
          const clean = `${window.location.origin}${window.location.pathname}`;
          window.history.replaceState({}, document.title, clean);
        } catch {
          // ignore
        }
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [client, storageKey, trackerDomain]);

  const subtitle =
    step === "redirecting"
      ? "Listo."
      : step === "error"
      ? "Ocurrió un problema."
      : "Procesando...";

  return (
    <div className="max-w-xl mx-auto px-4 py-10">
      <div className="border rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">App Geocercas</h1>
        <p className="text-sm text-slate-600 mt-2">{subtitle}</p>

        <p className="text-sm text-slate-700 mt-4">{status}</p>

        {error ? (
          <div className="mt-4 text-sm text-red-600">
            <div className="whitespace-pre-wrap">{error}</div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                className="border rounded px-3 py-2 text-xs"
                onClick={() => window.location.replace("/login")}
              >
                Ir a Login
              </button>
              <button className="border rounded px-3 py-2 text-xs" onClick={() => window.location.reload()}>
                Reintentar
              </button>
            </div>

            <div className="mt-4 text-xs text-slate-500">
              Tip: si el link viene de WhatsApp/FB, evita abrirlo en “preview”. Usa “Abrir en navegador”.
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
