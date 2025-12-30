// src/pages/AuthCallback.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

type Status =
  | { phase: "init"; message: string }
  | { phase: "working"; message: string }
  | { phase: "ok"; message: string }
  | { phase: "error"; message: string; details?: string };

function safeGetTarget(search: string): "panel" | "tracker" {
  const p = new URLSearchParams(search);
  const t = (p.get("target") || "").toLowerCase();
  return t === "tracker" ? "tracker" : "panel";
}

function isTrackerHostname(hostname: string) {
  const h = String(hostname || "").toLowerCase().trim();
  return h === "tracker.tugeocercas.com" || h.startsWith("tracker.");
}

function hasHashTokens(hash: string) {
  return /access_token=/.test(hash) && /refresh_token=/.test(hash);
}

function getHashParam(hash: string, key: string): string | null {
  const h = hash.startsWith("#") ? hash.slice(1) : hash;
  const p = new URLSearchParams(h);
  return p.get(key);
}

function decodeJwtPayload(token: string): any | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
    const json = atob(b64 + pad);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function issuerHostFromAccessToken(accessToken: string): string | null {
  const payload = decodeJwtPayload(accessToken);
  const iss = String(payload?.iss || "");
  try {
    const u = new URL(iss);
    return u.host || null;
  } catch {
    return null;
  }
}

function looksLikeClockSkew(e: any) {
  const msg = String(e?.message || e || "").toLowerCase();
  return msg.includes("issued in the future") || msg.includes("clock") || msg.includes("skew");
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    t = setTimeout(() => reject(new Error(`Timeout en ${label}`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (t) clearTimeout(t);
  }
}

function buildClient(url: string, anonKey: string): SupabaseClient {
  return createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false, // lo manejamos manual
    },
  });
}

function getEnv(name: string): string | null {
  const v = (import.meta as any).env?.[name];
  return v ? String(v) : null;
}

export default function AuthCallback() {
  const location = useLocation();
  const navigate = useNavigate();
  const target = useMemo(() => safeGetTarget(location.search), [location.search]);
  const startedRef = useRef(false);

  const [status, setStatus] = useState<Status>({
    phase: "init",
    message: "Confirmando acceso…",
  });

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const run = async () => {
      try {
        setStatus({ phase: "working", message: "Procesando Magic Link…" });

        const trackerHost = isTrackerHostname(window.location.hostname);

        // Panel env (obligatorias)
        const panelUrl = getEnv("VITE_SUPABASE_URL");
        const panelKey = getEnv("VITE_SUPABASE_ANON_KEY");
        if (!panelUrl || !panelKey) {
          throw new Error("Faltan env vars de PANEL: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY");
        }

        // Tracker env (opcionales; solo se usan si aplica)
        const trackerUrl = getEnv("VITE_SUPABASE_TRACKER_URL");
        const trackerKey = getEnv("VITE_SUPABASE_TRACKER_ANON_KEY");

        const panelClient = buildClient(panelUrl, panelKey);
        const trackerClient =
          trackerUrl && trackerKey ? buildClient(trackerUrl, trackerKey) : null;

        const code = new URLSearchParams(window.location.search).get("code");
        const hash = window.location.hash || "";

        // Elegimos cliente
        let client: SupabaseClient = panelClient;

        // Si estamos en tracker domain, intentamos usar tracker auth si existe
        if (trackerHost) {
          if (!trackerClient) {
            throw new Error(
              "Este dominio es TRACKER, pero faltan env vars: VITE_SUPABASE_TRACKER_URL / VITE_SUPABASE_TRACKER_ANON_KEY"
            );
          }
          client = trackerClient;
        }

        // Si viene access_token, podemos escoger por ISS (blindaje)
        if (hasHashTokens(hash)) {
          const access_token = getHashParam(hash, "access_token");
          const refresh_token = getHashParam(hash, "refresh_token");
          if (!access_token || !refresh_token) {
            throw new Error("Faltan tokens en el hash (access_token/refresh_token).");
          }

          const issHost = issuerHostFromAccessToken(access_token);
          const panelHost = new URL(panelUrl).host;
          const trackerAuthHost = trackerUrl ? new URL(trackerUrl).host : null;

          if (issHost && trackerAuthHost && issHost === trackerAuthHost) {
            if (!trackerClient) {
              throw new Error(
                "El Magic Link fue emitido por SUPABASE TRACKER, pero faltan env vars: VITE_SUPABASE_TRACKER_URL / VITE_SUPABASE_TRACKER_ANON_KEY"
              );
            }
            client = trackerClient;
          } else if (issHost && issHost === panelHost) {
            client = panelClient;
          }

          setStatus({ phase: "working", message: "Estableciendo sesión…" });

          await withTimeout(
            client.auth.setSession({ access_token, refresh_token }),
            30_000,
            "setSession"
          );

          // Limpia hash
          window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
        } else if (code) {
          setStatus({ phase: "working", message: "Intercambiando código…" });

          await withTimeout(client.auth.exchangeCodeForSession(code), 30_000, "exchangeCodeForSession");

          const p = new URLSearchParams(window.location.search);
          p.delete("code");
          const qs = p.toString();
          window.history.replaceState({}, document.title, window.location.pathname + (qs ? `?${qs}` : ""));
        } else {
          throw new Error("Callback sin parámetros (ni hash tokens ni code).");
        }

        setStatus({ phase: "working", message: "Confirmando sesión…" });

        const { data, error } = await withTimeout(client.auth.getSession(), 15_000, "getSession");
        if (error) throw error;
        if (!data?.session) throw new Error("Sesión no disponible luego del callback.");

        setStatus({ phase: "ok", message: "Acceso confirmado. Redirigiendo…" });

        // Redirección final
        const goTracker = trackerHost || target === "tracker";
        navigate(goTracker ? "/tracker-gps" : "/inicio", { replace: true });
      } catch (e: any) {
        console.error("[AuthCallback] error:", e);

        if (looksLikeClockSkew(e)) {
          setStatus({
            phase: "error",
            message: "El reloj del dispositivo está desfasado.",
            details:
              "Activa 'Fecha y hora automáticas' y 'Zona horaria automática' y vuelve a abrir un Magic Link NUEVO.",
          });
          return;
        }

        setStatus({
          phase: "error",
          message: "Ocurrió un problema.",
          details: String(e?.message || e),
        });
      }
    };

    run();
  }, [navigate, target, location.search]);

  return (
    <div style={{ padding: 24, maxWidth: 720 }}>
      <h1 style={{ marginBottom: 8 }}>App Geocercas</h1>

      {status.phase !== "error" ? (
        <p>{status.message}</p>
      ) : (
        <>
          <p>Ocurrió un problema.</p>
          <p style={{ color: "crimson", whiteSpace: "pre-wrap" }}>
            {status.details || status.message}
          </p>

          <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
            <button
              onClick={() => navigate("/login", { replace: true })}
              style={{ padding: "10px 14px", cursor: "pointer" }}
            >
              Ir a Login
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{ padding: "10px 14px", cursor: "pointer" }}
            >
              Reintentar
            </button>
          </div>
        </>
      )}
    </div>
  );
}
