// src/pages/AuthCallback.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

// OJO: usa el cliente canonical (panel) que ya tienes en tu proyecto.
// Mantengo el mismo import que tu archivo actual para no romper el build.
import { supabase } from "./supabaseClient"; // ajusta ruta solo si tu proyecto lo requiere

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
  // IMPLICIT: #access_token=...&refresh_token=...&expires_in=...
  return /access_token=/.test(hash) && /refresh_token=/.test(hash);
}

function getHashParam(hash: string, key: string): string | null {
  const h = hash.startsWith("#") ? hash.slice(1) : hash;
  const p = new URLSearchParams(h);
  return p.get(key);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let t: any;
  const timeout = new Promise<never>((_, reject) => {
    t = setTimeout(() => reject(new Error(`Timeout en ${label}`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(t);
  }
}

/**
 * Espera a que Supabase emita un evento de sesión (SIGNED_IN / TOKEN_REFRESHED),
 * lo cual reduce al mínimo carreras con AuthContext.
 */
function waitForSessionEvent(ms: number) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      sub?.subscription?.unsubscribe?.();
      reject(new Error("No se recibió evento de sesión a tiempo."));
    }, ms);

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        clearTimeout(timer);
        sub?.subscription?.unsubscribe?.();
        resolve();
      }
    });
  });
}

export default function AuthCallback() {
  const location = useLocation();
  const navigate = useNavigate();

  const target = useMemo(() => safeGetTarget(location.search), [location.search]);

  const [status, setStatus] = useState<Status>({
    phase: "init",
    message: "Confirmando acceso…",
  });

  // Evita dobles ejecuciones (React strict mode / re-render)
  const startedRef = useRef(false);

  // Lock anti-loop al recargar / volver
  const lockKey = "auth_callback_lock_v2";
  const lockTtlMs = 30_000;

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const run = async () => {
      try {
        setStatus({ phase: "working", message: "Procesando Magic Link…" });

        // 0) Lock anti-loop (con TTL)
        const lockRaw = sessionStorage.getItem(lockKey);
        if (lockRaw) {
          const ts = Number(lockRaw);
          if (!Number.isNaN(ts) && Date.now() - ts < lockTtlMs) {
            setStatus({
              phase: "error",
              message: "Se detectó un posible bucle de autenticación. Reintenta el Magic Link.",
              details: "lock",
            });
            return;
          }
        }
        sessionStorage.setItem(lockKey, String(Date.now()));

        // 1) Identificar callback (PKCE code o implicit hash)
        const code = new URLSearchParams(window.location.search).get("code");
        const hash = window.location.hash || "";

        const sawHashTokens = hasHashTokens(hash);

        // Prepara espera de evento de sesión ANTES de hacer el exchange/setSession
        const sessionEventPromise = waitForSessionEvent(12_000).catch(() => {
          // No fallamos aquí aún; puede que AuthContext obtenga sesión por otra vía.
          // Igual, la navegación final exige que la sesión exista en storage.
        });

        // 2) IMPLICIT (#access_token)
        if (sawHashTokens) {
          const access_token = getHashParam(hash, "access_token");
          const refresh_token = getHashParam(hash, "refresh_token");

          if (!access_token || !refresh_token) {
            throw new Error("Faltan tokens en el hash (access_token/refresh_token).");
          }

          setStatus({ phase: "working", message: "Estableciendo sesión…" });

          await withTimeout(
            supabase.auth.setSession({ access_token, refresh_token }),
            12_000,
            "setSession"
          );

          // Limpia hash para evitar re-proceso al refrescar
          window.history.replaceState(
            {},
            document.title,
            window.location.pathname + window.location.search
          );
        }
        // 3) PKCE (?code=...)
        else if (code) {
          setStatus({ phase: "working", message: "Intercambiando código de acceso…" });

          await withTimeout(
            supabase.auth.exchangeCodeForSession(code),
            15_000,
            "exchangeCodeForSession"
          );

          // Limpia el code de la URL (pero respeta otros params como target)
          const p = new URLSearchParams(window.location.search);
          p.delete("code");
          const qs = p.toString();
          window.history.replaceState(
            {},
            document.title,
            window.location.pathname + (qs ? `?${qs}` : "")
          );
        } else {
          throw new Error("Callback sin parámetros de sesión (ni hash tokens ni code).");
        }

        // 4) Confirmación mínima: la sesión debe existir en storage
        setStatus({ phase: "working", message: "Confirmando sesión…" });

        const { data, error } = await withTimeout(supabase.auth.getSession(), 12_000, "getSession");
        if (error) throw error;
        if (!data?.session) {
          throw new Error("Sesión no disponible luego del callback.");
        }

        // 5) Espera corta al evento (reduce carreras con AuthContext)
        await sessionEventPromise;
        await sleep(100);

        // 6) Redirección final
        setStatus({ phase: "ok", message: "Acceso confirmado. Redirigiendo…" });

        sessionStorage.removeItem(lockKey);

        if (target === "tracker") {
          navigate("/tracker-gps", { replace: true });
        } else {
          // Nota técnica: aquí NO validamos rol; esa responsabilidad es de PanelGate/SmartFallback
          navigate("/inicio", { replace: true });
        }
      } catch (e: any) {
        console.error("[AuthCallback] error:", e);
        sessionStorage.removeItem(lockKey);

        const msg = String(e?.message || e);

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

          <p style={{ marginTop: 16, opacity: 0.8 }}>
            Tip: si el link viene de WhatsApp/FB, evita abrirlo en “preview”. Usa “Abrir en navegador”.
          </p>
        </>
      )}
    </div>
  );
}
