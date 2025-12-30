// src/pages/AuthCallback.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

// Ajusta esta ruta según tu proyecto:
// - Si supabaseClient está en src/supabaseClient.* => "../supabaseClient"
// - Si está en src/pages/supabaseClient.* => "./supabaseClient"
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

function isIssuedInTheFutureError(e: any): boolean {
  const msg = String(e?.message || e || "").toLowerCase();
  return msg.includes("issued in the future") || msg.includes("clock") || msg.includes("skew");
}

export default function AuthCallback() {
  const location = useLocation();
  const navigate = useNavigate();

  const target = useMemo(() => safeGetTarget(location.search), [location.search]);

  const [status, setStatus] = useState<Status>({
    phase: "init",
    message: "Confirmando acceso…",
  });

  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const run = async () => {
      try {
        setStatus({ phase: "working", message: "Procesando Magic Link…" });

        const code = new URLSearchParams(window.location.search).get("code");
        const hash = window.location.hash || "";

        // 🔥 Tiempo más alto para móvil/TWA
        const SET_SESSION_TIMEOUT = 25_000;
        const EXCHANGE_TIMEOUT = 25_000;
        const GET_SESSION_TIMEOUT = 15_000;

        if (hasHashTokens(hash)) {
          const access_token = getHashParam(hash, "access_token");
          const refresh_token = getHashParam(hash, "refresh_token");

          if (!access_token || !refresh_token) {
            throw new Error("Faltan tokens en el hash (access_token/refresh_token).");
          }

          setStatus({ phase: "working", message: "Estableciendo sesión…" });

          await withTimeout(
            supabase.auth.setSession({ access_token, refresh_token }),
            SET_SESSION_TIMEOUT,
            "setSession"
          );

          // Limpia hash para evitar reproceso
          window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
        } else if (code) {
          setStatus({ phase: "working", message: "Intercambiando código…" });

          await withTimeout(
            supabase.auth.exchangeCodeForSession(code),
            EXCHANGE_TIMEOUT,
            "exchangeCodeForSession"
          );

          const p = new URLSearchParams(window.location.search);
          p.delete("code");
          const qs = p.toString();
          window.history.replaceState({}, document.title, window.location.pathname + (qs ? `?${qs}` : ""));
        } else {
          throw new Error("Callback sin parámetros (ni hash tokens ni code).");
        }

        setStatus({ phase: "working", message: "Confirmando sesión…" });

        const { data, error } = await withTimeout(
          supabase.auth.getSession(),
          GET_SESSION_TIMEOUT,
          "getSession"
        );
        if (error) throw error;
        if (!data?.session) throw new Error("Sesión no disponible luego del callback.");

        setStatus({ phase: "ok", message: "Acceso confirmado. Redirigiendo…" });

        navigate(target === "tracker" ? "/tracker-gps" : "/inicio", { replace: true });
      } catch (e: any) {
        console.error("[AuthCallback] error:", e);

        if (isIssuedInTheFutureError(e)) {
          setStatus({
            phase: "error",
            message: "El reloj del dispositivo está desfasado.",
            details:
              "Activa 'Fecha y hora automáticas' y 'Zona horaria automática', luego reintenta el Magic Link.",
          });
          return;
        }

        setStatus({
          phase: "error",
          message: "No se pudo completar el inicio de sesión.",
          details: String(e?.message || e),
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
