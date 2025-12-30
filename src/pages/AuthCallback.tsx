// src/pages/AuthCallback.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

// ✅ Cliente CANONICAL del PANEL (el mismo que usa tu AuthContext)
import { supabase as supabasePanel } from "../supabaseClient";

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

function getEnv(name: string): string | null {
  const v = (import.meta as any).env?.[name];
  return v ? String(v) : null;
}

function buildTrackerClientIfPossible(): SupabaseClient | null {
  const trackerUrl = getEnv("VITE_SUPABASE_TRACKER_URL");
  const trackerKey = getEnv("VITE_SUPABASE_TRACKER_ANON_KEY");
  if (!trackerUrl || !trackerKey) return null;

  return createClient(trackerUrl, trackerKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
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
        const trackerClient = buildTrackerClientIfPossible();

        const code = new URLSearchParams(window.location.search).get("code");
        const hash = window.location.hash || "";

        // timeouts realistas (móvil/TWA)
        const SET_SESSION_TIMEOUT = 30_000;
        const EXCHANGE_TIMEOUT = 30_000;
        const GET_SESSION_TIMEOUT = 15_000;

        // Selección por defecto:
        // - Panel domain => SIEMPRE usamos el cliente canonical del panel (supabasePanel)
        // - Tracker domain => usamos trackerClient si existe, si no, mostramos error claro
        let client: SupabaseClient = supabasePanel;

        if (trackerHost) {
          if (!trackerClient) {
            throw new Error(
              "Dominio TRACKER detectado, pero faltan env vars: VITE_SUPABASE_TRACKER_URL / VITE_SUPABASE_TRACKER_ANON_KEY"
            );
          }
          client = trackerClient;
        }

        // Si viene token en hash, podemos ajustar por ISS (blindaje):
        // - Si el token dice que viene del tracker y estás en panel, no lo “fuerces” al panel:
        //   muéstralo como error (evita loops).
        if (hasHashTokens(hash)) {
          const access_token = getHashParam(hash, "access_token");
          const refresh_token = getHashParam(hash, "refresh_token");
          if (!access_token || !refresh_token) {
            throw new Error("Faltan tokens en el hash (access_token/refresh_token).");
          }

          const issHost = issuerHostFromAccessToken(access_token);

          // Si tenemos trackerClient y el issuer es tracker, usamos tracker
          if (trackerClient && issHost) {
            const trackerHostFromEnv = new URL(getEnv("VITE_SUPABASE_TRACKER_URL") as string).host;
            if (issHost === trackerHostFromEnv) {
              client = trackerClient;
            }
          }

          // Si estás en panel (www) pero el token es tracker -> no intentes setSession en panel
          if (!trackerHost && trackerClient && issHost) {
            const trackerHostFromEnv = new URL(getEnv("VITE_SUPABASE_TRACKER_URL") as string).host;
            if (issHost === trackerHostFromEnv) {
              throw new Error(
                "Este Magic Link pertenece al TRACKER (proyecto tracker-auth). Abre el link en el dominio tracker o genera un link de ADMIN/PANEL."
              );
            }
          }

          setStatus({ phase: "working", message: "Estableciendo sesión…" });

          await withTimeout(
            client.auth.setSession({ access_token, refresh_token }),
            SET_SESSION_TIMEOUT,
            "setSession"
          );

          // Limpia hash para evitar reproceso
          window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
        } else if (code) {
          // PKCE: se intercambia con el mismo cliente que corresponda al dominio
          setStatus({ phase: "working", message: "Intercambiando código…" });

          await withTimeout(client.auth.exchangeCodeForSession(code), EXCHANGE_TIMEOUT, "exchangeCodeForSession");

          const p = new URLSearchParams(window.location.search);
          p.delete("code");
          const qs = p.toString();
          window.history.replaceState({}, document.title, window.location.pathname + (qs ? `?${qs}` : ""));
        } else {
          throw new Error("Callback sin parámetros (ni hash tokens ni code).");
        }

        // ✅ Confirmación mínima: sesión debe existir EN EL CLIENTE CANONICAL DEL PANEL si estamos en panel
        setStatus({ phase: "working", message: "Confirmando sesión…" });

        const confirmClient = trackerHost ? client : supabasePanel; // panel confirma en canonical
        const { data, error } = await withTimeout(confirmClient.auth.getSession(), GET_SESSION_TIMEOUT, "getSession");
        if (error) throw error;
        if (!data?.session) throw new Error("Sesión no disponible luego del callback.");

        setStatus({ phase: "ok", message: "Acceso confirmado. Redirigiendo…" });

        // redirección final
        const goTracker = trackerHost || target === "tracker";
        navigate(goTracker ? "/tracker-gps" : "/inicio", { replace: true });
      } catch (e: any) {
        console.error("[AuthCallback] error:", e);

        if (looksLikeClockSkew(e)) {
          setStatus({
            phase: "error",
            message: "El reloj del dispositivo está desfasado.",
            details:
              "Activa 'Fecha y hora automáticas' y 'Zona horaria automática'. Luego abre un Magic Link NUEVO.",
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
