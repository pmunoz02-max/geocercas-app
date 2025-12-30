// src/pages/AuthCallback.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import { supabaseTracker } from "../supabaseTrackerClient";

type StatusStep =
  | "init"
  | "parsing"
  | "saving"
  | "setting"
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

function cleanUrlKeepPath() {
  try {
    const clean = `${window.location.origin}${window.location.pathname}`;
    window.history.replaceState({}, document.title, clean);
  } catch {}
}

function base64UrlToJson(b64url: string) {
  // base64url -> base64
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
  const str = atob(b64 + pad);
  return JSON.parse(str);
}

function decodeJwt(accessToken: string) {
  const parts = accessToken.split(".");
  if (parts.length !== 3) throw new Error("Access token JWT inválido.");
  const payload = base64UrlToJson(parts[1]);
  return payload;
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

  // Deben coincidir con tus createClient()
  const STORAGE_KEY_PANEL = "sb-tugeocercas-auth-token-panel-authA";
  const STORAGE_KEY_TRACKER = "sb-tugeocercas-auth-token-tracker-authB";
  const storageKey = trackerDomain ? STORAGE_KEY_TRACKER : STORAGE_KEY_PANEL;

  const [step, setStep] = useState<StatusStep>("init");
  const [status, setStatus] = useState("Iniciando...");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    // Debug útil en consola:
    (window as any).__SUPABASE_AUTH_DEBUG = {
      storageKey,
      trackerDomain,
      getRawStorage: () => safeJsonParse(localStorage.getItem(storageKey)),
    };
  }, [storageKey, trackerDomain]);

  useEffect(() => {
    let cancelled = false;

    const hardRedirect = (to: string) => {
      window.location.replace(to);
    };

    const run = async () => {
      try {
        setError("");
        setStep("parsing");
        setStatus("Confirmando acceso...");

        const url = new URL(window.location.href);
        const code = url.searchParams.get("code") || "";

        // ✅ Para invitaciones universales, esperamos tokens en HASH
        // Si llega code=..., normalmente es PKCE y puede fallar por faltar verifier.
        if (code) {
          throw new Error(
            "Este link llegó como ?code= (PKCE). Para invitaciones universales debes usar el Magic Link real con #access_token. " +
              "Reenvía el link que devuelve la Edge Function (action_link)."
          );
        }

        const h = parseHash(window.location.hash || "");
        if (!h.access_token || !h.refresh_token) {
          throw new Error(
            "No llegaron tokens en el link (access_token/refresh_token). " +
              "Si lo abriste desde previsualización (WhatsApp/FB), usa 'Abrir en navegador' (Chrome/Safari) y el Magic Link original."
          );
        }

        // ✅ Decodificamos JWT para armar user sin llamar /auth/v1/user (evita 403 por proyecto equivocado)
        const jwt = decodeJwt(h.access_token);

        // ✅ Detectar reloj desfasado (token “del futuro”)
        const now = Math.floor(Date.now() / 1000);
        const iat = Number(jwt?.iat || 0);
        // Si iat está > ahora + 2 min, hay skew
        if (iat && iat > now + 120) {
          throw new Error(
            "El reloj del dispositivo está desfasado (la sesión parece emitida en el futuro). " +
              "Activa 'Fecha y hora automáticas' y 'Zona horaria automática' en el dispositivo y vuelve a abrir el Magic Link."
          );
        }

        const user = {
          id: jwt.sub,
          email: jwt.email,
          phone: jwt.phone || "",
          app_metadata: jwt.app_metadata || {},
          user_metadata: jwt.user_metadata || {},
          aud: jwt.aud,
          created_at: jwt.created_at,
          role: jwt.role,
        };

        setStep("saving");
        setStatus("Guardando sesión...");

        const sessionPayload = buildSessionPayload({
          accessToken: h.access_token,
          refreshToken: h.refresh_token,
          expiresAt: h.expires_at,
          tokenType: h.token_type,
          user,
        });

        // Guardamos en TU storageKey (panel/tracker)
        writeSessionToStorage(storageKey, sessionPayload);

        // Best-effort setSession (si cuelga, no bloquea)
        setStep("setting");
        setStatus("Estableciendo sesión...");

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
          // No es fatal: el hard redirect rehidrata desde localStorage
        }

        cleanUrlKeepPath();

        if (cancelled) return;
        setStep("redirecting");
        setStatus("Redirigiendo...");

        hardRedirect(trackerDomain ? "/tracker-gps" : "/inicio");
      } catch (e: any) {
        console.error("[AuthCallback] error:", e);
        if (cancelled) return;
        setStep("error");
        setStatus("No se pudo completar el inicio de sesión.");
        setError(e?.message || "Error estableciendo sesión.");
        cleanUrlKeepPath();
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [client, storageKey, trackerDomain]);

  return (
    <div className="max-w-xl mx-auto px-4 py-10">
      <div className="border rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">App Geocercas</h1>
        <p className="text-sm text-slate-600 mt-2">
          {step === "error" ? "Ocurrió un problema." : "Procesando..."}
        </p>

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
