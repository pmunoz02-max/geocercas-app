// src/pages/AuthCallback.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { useAuth } from "../context/AuthContext";
import { useTranslation } from "react-i18next";

const LOCK_PREFIX = "authcb_lock_v2:";
const DONE_PREFIX = "authcb_done_v2:";

function safeKey(s: string) {
  return s.replace(/[^a-zA-Z0-9:_-]/g, "_").slice(0, 220);
}

function stripUrlAll() {
  // Limpia query + hash sin recargar (evita re-ejecución por refresh)
  try {
    const clean = `${window.location.origin}${window.location.pathname}`;
    window.history.replaceState({}, document.title, clean);
  } catch {
    // ignore
  }
}

function parseQueryParams(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const usp = new URLSearchParams(window.location.search || "");
    for (const [k, v] of usp.entries()) out[k] = v;
  } catch {
    // ignore
  }
  return out;
}

function parseHashParams(): Record<string, string> {
  // Supabase recovery clásico usa #access_token=...&refresh_token=...&type=recovery
  const out: Record<string, string> = {};
  try {
    const raw = (window.location.hash || "").replace(/^#/, "");
    if (!raw) return out;
    const usp = new URLSearchParams(raw);
    for (const [k, v] of usp.entries()) out[k] = v;
  } catch {
    // ignore
  }
  return out;
}

export default function AuthCallback() {
  const navigate = useNavigate();
  const { session, role, loading } = useAuth();
  const { t } = useTranslation();

  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [processing, setProcessing] = useState(true);

  const ranRef = useRef(false);

  const input = useMemo(() => {
    const q = parseQueryParams();
    const h = parseHashParams();

    // Preferimos query para PKCE (code) y OTP (token_hash)
    // Preferimos hash para recovery clásico (access_token/refresh_token)
    const type = String(q.type || h.type || "").toLowerCase();

    return {
      // Query
      code: q.code || "",
      token_hash: q.token_hash || "",
      q_type: String(q.type || "").toLowerCase(),

      // Hash
      access_token: h.access_token || "",
      refresh_token: h.refresh_token || "",
      h_type: String(h.type || "").toLowerCase(),

      // Unified
      type,
      error_description: q.error_description || h.error_description || "",
      error_code: q.error_code || h.error_code || "",
    };
  }, []);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    let timeoutId: number | undefined;

    const run = async () => {
      try {
        // Si Supabase manda error en query/hash, mostrarlo
        if (input.error_description) {
          setError(input.error_description);
          setProcessing(false);
          stripUrlAll();
          return;
        }

        // ❌ Bloqueo explícito de legacy INVITE
        if (input.type === "invite") {
          setError(
            t("authCallback.inviteLegacy", {
              defaultValue:
                "Este enlace pertenece al sistema antiguo (INVITE) y ya no es válido.\nSolicita un nuevo Magic Link desde la app.",
            })
          );
          setProcessing(false);
          stripUrlAll();
          return;
        }

        // Determinar clave para lock/anti-reintento
        const keyRaw =
          input.code
            ? `code:${input.code}`
            : input.token_hash
            ? `token_hash:${input.token_hash}:${input.q_type || input.type || "unknown"}`
            : input.access_token
            ? `access_token:${input.access_token.slice(0, 24)}:${input.type || "hash"}`
            : "";

        if (!keyRaw) {
          setError(
            t("authCallback.missingParams", {
              defaultValue:
                "Faltan parámetros de autenticación.\nSolicita un nuevo Magic Link e inténtalo nuevamente.",
            })
          );
          setProcessing(false);
          stripUrlAll();
          return;
        }

        const lockKey = safeKey(`${LOCK_PREFIX}${keyRaw}`);
        const doneKey = safeKey(`${DONE_PREFIX}${keyRaw}`);

        if (sessionStorage.getItem(doneKey) === "1") {
          setProcessing(false);
          stripUrlAll();
          return;
        }

        if (sessionStorage.getItem(lockKey) === "1") {
          setProcessing(false);
          stripUrlAll();
          return;
        }
        sessionStorage.setItem(lockKey, "1");

        timeoutId = window.setTimeout(() => {
          setError(
            t("authCallback.timeout", {
              defaultValue:
                "La autenticación tardó demasiado.\nIntenta nuevamente o solicita un nuevo Magic Link.",
            })
          );
          setProcessing(false);
        }, 15000);

        // ✅ CASO 1: PKCE moderno -> ?code=...
        if (input.code) {
          const { error } = await supabase.auth.exchangeCodeForSession(input.code);
          if (error) {
            setDetail(`${error.status || ""} ${error.message || ""}`.trim());
            throw error;
          }

          sessionStorage.setItem(doneKey, "1");
          sessionStorage.removeItem(lockKey);

          // Si es recovery por PKCE, redirigir a reset-password
          if (input.type === "recovery" || input.q_type === "recovery") {
            stripUrlAll();
            setProcessing(false);
            navigate("/reset-password", { replace: true });
            return;
          }

          stripUrlAll();
          setProcessing(false);
          return;
        }

        // ✅ CASO 2: OTP clásico -> ?token_hash=...&type=magiclink|recovery|signup|email_change
        if (input.token_hash) {
          const allowed = ["magiclink", "recovery", "signup", "email_change"];
          const otpType = allowed.includes(input.q_type || input.type)
            ? (input.q_type || input.type)
            : "magiclink";

          const { error } = await supabase.auth.verifyOtp({
            token_hash: input.token_hash,
            type: otpType as any,
          });

          if (error) {
            setDetail(`${error.status || ""} ${error.message || ""}`.trim());
            throw error;
          }

          sessionStorage.setItem(doneKey, "1");
          sessionStorage.removeItem(lockKey);

          if (otpType === "recovery") {
            stripUrlAll();
            setProcessing(false);
            navigate("/reset-password", { replace: true });
            return;
          }

          stripUrlAll();
          setProcessing(false);
          return;
        }

        // ✅ CASO 3: Recovery clásico por HASH -> #access_token=...&refresh_token=...&type=recovery
        if (input.access_token && input.refresh_token) {
          const { error } = await supabase.auth.setSession({
            access_token: input.access_token,
            refresh_token: input.refresh_token,
          });

          if (error) {
            setDetail(`${error.status || ""} ${error.message || ""}`.trim());
            throw error;
          }

          sessionStorage.setItem(doneKey, "1");
          sessionStorage.removeItem(lockKey);

          // En recovery siempre vamos a reset-password
          if (input.type === "recovery" || input.h_type === "recovery") {
            stripUrlAll();
            setProcessing(false);
            navigate("/reset-password", { replace: true });
            return;
          }

          stripUrlAll();
          setProcessing(false);
          return;
        }

        // Si llega aquí, algo raro
        setError(
          t("authCallback.missingParams", {
            defaultValue:
              "Faltan parámetros de autenticación.\nSolicita un nuevo Magic Link e inténtalo nuevamente.",
          })
        );
        setProcessing(false);
        stripUrlAll();
      } catch (e: any) {
        const msg =
          e?.message ||
          t("authCallback.invalidOrExpired", {
            defaultValue:
              "Email link inválido o expirado.\nCausas comunes: (1) el enlace ya fue usado, (2) fue abierto por un scanner del correo, o (3) hubo un refresh.\nSolicita un nuevo Magic Link.",
          });

        setError(msg);
        setProcessing(false);
        stripUrlAll();
      } finally {
        if (timeoutId) window.clearTimeout(timeoutId);
      }
    };

    run();
  }, [input, navigate, t]);

  // ✅ Redirección final por rol cuando ya hay sesión (no recovery)
  useEffect(() => {
    if (processing) return;
    if (loading) return;
    if (!session) return;
    if (error) return;

    const r = String(role || "").toLowerCase();
    if (r === "tracker") navigate("/tracker-gps", { replace: true });
    else navigate("/inicio", { replace: true });
  }, [processing, loading, session, role, error, navigate]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-200 p-4">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
          <h1 className="text-lg font-semibold">
            {t("authCallback.title", { defaultValue: "Error de autenticación" })}
          </h1>

          <p className="text-sm opacity-85 whitespace-pre-line">{error}</p>

          {detail ? (
            <div className="text-[11px] opacity-60 break-all border border-slate-800 rounded p-2 bg-slate-950">
              {detail}
            </div>
          ) : null}

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => navigate("/login?mode=magic", { replace: true })}
              className="px-4 py-2 rounded-lg bg-sky-600 text-white text-sm font-semibold hover:bg-sky-500"
            >
              {t("authCallback.goToLogin", { defaultValue: "Ir a Login" })}
            </button>
          </div>

          <div className="text-[11px] opacity-60">
            {t("authCallback.tip", {
              defaultValue:
                "Tip: abre el Magic Link en Chrome/Safari. Si falló antes, intenta en incógnito y solicita un link nuevo.",
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-200">
      <div className="text-sm opacity-80">
        {processing
          ? t("authCallback.processing", { defaultValue: "Procesando autenticación…" })
          : t("authCallback.finishing", { defaultValue: "Finalizando…" })}
      </div>
    </div>
  );
}
