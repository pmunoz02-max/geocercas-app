// src/pages/AuthCallback.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

// ✅ IMPORT CANONICAL (PANEL)
// Ajusta SOLO esta ruta si tu proyecto lo requiere:
// - si existe src/supabaseClient.(ts|js)  => "../supabaseClient"
// - si existe src/pages/supabaseClient.* => "./supabaseClient"
import { supabase } from "../supabaseClient";

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

/**
 * Valida “issued in the future” por skew de reloj, ANTES de llamar a setSession.
 * Si el iat está muy adelantado respecto al reloj local, lo detectamos y mostramos
 * un mensaje claro (en vez de terminar en timeout/403 confuso).
 */
function detectClockSkew(accessToken: string): { skewSec: number; iat?: number; now?: number } | null {
  const payload = decodeJwtPayload(accessToken);
  if (!payload || typeof payload.iat !== "number") return null;

  const now = Math.floor(Date.now() / 1000);
  const iat = payload.iat;

  // iat en el futuro => skew positivo
  const skewSec = iat - now;
  return { skewSec, iat, now };
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

function looksLikeClockError(e: any) {
  const msg = String(e?.message || e || "").toLowerCase();
  return msg.includes("issued in the future") || msg.includes("clock") || msg.includes("skew");
}

function looksLikeForbidden(e: any) {
  const msg = String(e?.message || e || "").toLowerCase();
  return msg.includes("403") || msg.includes("forbidden");
}

export default function AuthCallback() {
  const location = useLocation();
  const navigate = useNavigate();

  const target = useMemo(() => safeGetTarget(location.search), [location.search]);

  const [status, setStatus] = useState<Status>({
    phase: "init",
    message: "Confirmando acceso…",
  });

  // evita doble ejecución (StrictMode)
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const run = async () => {
      try {
        setStatus({ phase: "working", message: "Procesando Magic Link…" });

        const code = new URLSearchParams(window.location.search).get("code");
        const hash = window.location.hash || "";

        // Timeouts más realistas para móvil/TWA
        const SET_SESSION_TIMEOUT = 30_000;
        const EXCHANGE_TIMEOUT = 30_000;
        const GET_SESSION_TIMEOUT = 15_000;

        // --- IMPLICIT FLOW (#access_token=...&refresh_token=...) ---
        if (hasHashTokens(hash)) {
          const access_token = getHashParam(hash, "access_token");
          const refresh_token = getHashParam(hash, "refresh_token");

          if (!access_token || !refresh_token) {
            throw new Error("Faltan tokens en el hash (access_token/refresh_token).");
          }

          // ✅ Detecta skew antes de setSession
          const skew = detectClockSkew(access_token);
          // tolerancia 120s (2 min). Si tu entorno es sensible, sube a 300s.
          if (skew && skew.skewSec > 120) {
            throw new Error(
              `CLOCK_SKEW: El token fue emitido en el futuro (iat=${skew.iat}, now=${skew.now}, skew=${skew.skewSec}s). ` +
                `Activa Fecha/Hora automáticas y Zona Horaria automática y reintenta.`
            );
          }

          setStatus({ phase: "working", message: "Estableciendo sesión…" });

          await withTimeout(
            supabase.auth.setSession({ access_token, refresh_token }),
            SET_SESSION_TIMEOUT,
            "setSession"
          );

          // Limpia hash para evitar reproceso (muy importante en móviles/WhatsApp)
          window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
        }
        // --- PKCE FLOW (?code=...) ---
        else if (code) {
          setStatus({ phase: "working", message: "Intercambiando código…" });

          await withTimeout(supabase.auth.exchangeCodeForSession(code), EXCHANGE_TIMEOUT, "exchangeCodeForSession");

          // Limpia el code, preservando otros params
          const p = new URLSearchParams(window.location.search);
          p.delete("code");
          const qs = p.toString();
          window.history.replaceState({}, document.title, window.location.pathname + (qs ? `?${qs}` : ""));
        } else {
          throw new Error("Callback sin parámetros (ni hash tokens ni code).");
        }

        // Confirmación mínima: la sesión debe existir
        setStatus({ phase: "working", message: "Confirmando sesión…" });

        const { data, error } = await withTimeout(supabase.auth.getSession(), GET_SESSION_TIMEOUT, "getSession");
        if (error) throw error;
        if (!data?.session) throw new Error("Sesión no disponible luego del callback.");

        setStatus({ phase: "ok", message: "Acceso confirmado. Redirigiendo…" });

        // ✅ Redirección final (el rol lo valida PanelGate/SmartFallback)
        navigate(target === "tracker" ? "/tracker-gps" : "/inicio", { replace: true });
      } catch (e: any) {
        console.error("[AuthCallback] error:", e);

        const msg = String(e?.message || e);

        // Mensaje ultra-claro para el caso que ya viste en consola:
        // "Session as retrieved from URL was issued in the future? Check the device clock for skew"
        if (msg.startsWith("CLOCK_SKEW:") || looksLikeClockError(e)) {
          setStatus({
            phase: "error",
            message: "El reloj del dispositivo está desfasado.",
            details:
              "Activa 'Fecha y hora automáticas' y 'Zona horaria automática' (y reinicia el dispositivo si es necesario). Luego abre un Magic Link nuevo.",
          });
          return;
        }

        // Si ves 403 en /auth/v1/user en consola, lo más común es:
        // - token emitido por otro proyecto Supabase (mezcla de proyectos)
        // - o sesión inválida por skew/expiración
        if (looksLikeForbidden(e) || msg.includes("403")) {
          setStatus({
            phase: "error",
            message: "Acceso rechazado (403) por Supabase.",
            details:
              "Causas típicas: (1) el Magic Link fue emitido por otro proyecto Supabase distinto al que usa la app; (2) reloj del dispositivo desfasado; (3) link expirado. Genera un Magic Link nuevo tras confirmar VITE_SUPABASE_URL/ANON_KEY en Vercel.",
          });
          return;
        }

        setStatus({
          phase: "error",
          message: "No se pudo completar el inicio de sesión.",
          details: msg,
        });
      }
    };

    run();
  }, [navigate, target]);

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
