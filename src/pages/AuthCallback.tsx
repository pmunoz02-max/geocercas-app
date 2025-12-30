import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

// OJO: importa TU cliente canonical (panel)
// (si tienes uno específico para tracker, aquí NO lo uses)
import { supabase } from "./supabaseClient"; // ajusta ruta si es distinto

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

  // Lock en sessionStorage para evitar loop al volver/recargar
  const lockKey = "auth_callback_lock_v1";

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const run = async () => {
      try {
        setStatus({ phase: "working", message: "Estableciendo sesión…" });

        // 0) Lock anti-loop
        const existingLock = sessionStorage.getItem(lockKey);
        if (existingLock) {
          // Si ya intentó hace nada, evita bucle
          setStatus({
            phase: "error",
            message: "Se detectó un bucle de autenticación. Reintenta el Magic Link.",
            details: "lock",
          });
          return;
        }
        sessionStorage.setItem(lockKey, String(Date.now()));

        // 1) Detectar tipo de callback
        const url = window.location.href;
        const code = new URLSearchParams(window.location.search).get("code");
        const hash = window.location.hash || "";

        console.log("[AuthCallback] url:", url);
        console.log("[AuthCallback] target:", target);
        console.log("[AuthCallback] code?:", code);
        console.log("[AuthCallback] hasHashTokens?:", hasHashTokens(hash));

        // 2) Si viene con tokens en hash (IMPLICIT)
        if (hasHashTokens(hash)) {
          const access_token = getHashParam(hash, "access_token");
          const refresh_token = getHashParam(hash, "refresh_token");

          if (!access_token || !refresh_token) {
            throw new Error("Faltan tokens en el hash (access_token/refresh_token).");
          }

          // setSession guarda en storage y dispara onAuthStateChange
          await withTimeout(
            supabase.auth.setSession({ access_token, refresh_token }),
            12000,
            "setSession"
          );

          // Limpia el hash para que no re-procese al refrescar
          window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
        }
        // 3) Si viene con code (PKCE)
        else if (code) {
          // exchangeCodeForSession usa el code_verifier guardado por el login/flow PKCE
          // (Si el code viene de un link generado sin PKCE, este paso falla.)
          await withTimeout(supabase.auth.exchangeCodeForSession(code), 15000, "exchangeCodeForSession");

          // Limpia el code de la URL
          const p = new URLSearchParams(window.location.search);
          p.delete("code");
          const qs = p.toString();
          window.history.replaceState({}, document.title, window.location.pathname + (qs ? `?${qs}` : ""));
        } else {
          throw new Error("Callback sin parámetros de sesión (ni hash tokens ni code).");
        }

        // 4) Confirmar sesión real
        setStatus({ phase: "working", message: "Validando sesión…" });

        const { data: sData, error: sErr } = await withTimeout(supabase.auth.getSession(), 12000, "getSession");
        if (sErr) throw sErr;
        const session = sData?.session ?? null;
        if (!session) {
          throw new Error("Sesión no disponible luego del callback.");
        }

        // 5) Obtener usuario (si falla con “issued in the future”, suele ser reloj del dispositivo)
        const { data: uData, error: uErr } = await withTimeout(supabase.auth.getUser(), 12000, "getUser");
        if (uErr) {
          const msg = String((uErr as any)?.message || uErr);
          if (msg.toLowerCase().includes("issued in the future")) {
            throw new Error(
              "El reloj del dispositivo parece desfasado. Ajusta fecha/hora automáticas y reintenta el Magic Link."
            );
          }
          throw uErr;
        }

        console.log("[AuthCallback] user:", uData?.user?.email);

        // 6) Redirección final (universal)
        setStatus({ phase: "ok", message: "Acceso confirmado. Redirigiendo…" });

        // Quita lock
        sessionStorage.removeItem(lockKey);

        // Pequeño delay para que AuthContext alcance a reaccionar
        await sleep(150);

        if (target === "tracker") {
          navigate("/tracker-gps", { replace: true });
        } else {
          navigate("/inicio", { replace: true });
        }
      } catch (e: any) {
        console.error("[AuthCallback] error:", e);

        // Quita lock para permitir reintento manual
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
          <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
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
