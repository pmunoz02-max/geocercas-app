// src/pages/AuthCallback.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { useAuth } from "../context/AuthContext";
import { useTranslation } from "react-i18next";

/**
 * AuthCallback (UNIVERSAL)
 * ✅ Soporta:
 *  - Magic Link moderno (PKCE): ?code=... (exchangeCodeForSession)
 *  - Magic Link clásico: ?token_hash=...&type=magiclink (verifyOtp)
 *
 * ❌ Rechaza explícitamente:
 *  - type=invite (flujo legacy) -> mensaje claro, no intenta verify
 *
 * Protecciones:
 *  - Lock por token/code en sessionStorage para evitar reintentos/refresh
 *  - Limpieza de URL después de procesar
 *  - Timeout + UI clara
 *
 * Redirección final por rol (desde AuthContext):
 *  - tracker -> /tracker-gps
 *  - admin/owner/otros -> /inicio
 */

const LOCK_PREFIX = "authcb_lock_v1:";
const DONE_PREFIX = "authcb_done_v1:";

function safeKey(s: string) {
  return s.replace(/[^a-zA-Z0-9:_-]/g, "_").slice(0, 220);
}

function stripUrl() {
  // limpia query + hash sin recargar
  try {
    const clean = `${window.location.origin}${window.location.pathname}`;
    window.history.replaceState({}, document.title, clean);
  } catch {
    // ignore
  }
}

export default function AuthCallback() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { session, role, loading } = useAuth();
  const { t } = useTranslation();

  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(true);
  const [detail, setDetail] = useState<string | null>(null);

  const ranRef = useRef(false);

  const input = useMemo(() => {
    const type = String(params.get("type") || "").toLowerCase();
    const token_hash = params.get("token_hash") || "";
    const code = params.get("code") || "";
    const error_description = params.get("error_description") || "";
    const error_code = params.get("error_code") || "";
    return { type, token_hash, code, error_description, error_code };
  }, [params]);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    let timeoutId: number | undefined;

    const run = async () => {
      try {
        // Si Supabase manda error en query, mostrarlo.
        if (input.error_description) {
          setError(input.error_description);
          setProcessing(false);
          return;
        }

        // ❌ Bloqueo explícito de legacy
        if (input.type === "invite") {
          setError(
            t("authCallback.inviteLegacy", {
              defaultValue:
                "Este enlace pertenece al sistema antiguo (INVITE) y ya no es válido.\nSolicita un nuevo Magic Link desde la app.",
            })
          );
          setProcessing(false);
          // Limpieza para evitar reintentos con refresh
          stripUrl();
          return;
        }

        // Determinar “clave” de protección (code o token_hash)
        const keyRaw = input.code
          ? `code:${input.code}`
          : input.token_hash
          ? `token_hash:${input.token_hash}:${input.type || "unknown"}`
          : "";

        if (!keyRaw) {
          setError(
            t("authCallback.missingParams", {
              defaultValue:
                "Faltan parámetros de autenticación.\nSolicita un nuevo Magic Link e inténtalo nuevamente.",
            })
          );
          setProcessing(false);
          stripUrl();
          return;
        }

        const key = safeKey(`${LOCK_PREFIX}${keyRaw}`);
        const doneKey = safeKey(`${DONE_PREFIX}${keyRaw}`);

        // Si ya se procesó antes, no reintentar (evita loops por refresh)
        if (sessionStorage.getItem(doneKey) === "1") {
          setProcessing(false);
          stripUrl();
          return;
        }

        // Lock (si ya está lockeado, no duplicar)
        if (sessionStorage.getItem(key) === "1") {
          setProcessing(false);
          stripUrl();
          return;
        }
        sessionStorage.setItem(key, "1");

        timeoutId = window.setTimeout(() => {
          setError(
            t("authCallback.timeout", {
              defaultValue:
                "La autenticación tardó demasiado.\nIntenta nuevamente o solicita un nuevo Magic Link.",
            })
          );
          setProcessing(false);
        }, 15000);

        // ✅ Caso A: Magic Link PKCE (moderno) -> code
        if (input.code) {
          const { error } = await supabase.auth.exchangeCodeForSession(input.code);
          if (error) {
            // Supabase suele dar mensajes como "Email link is invalid or has expired"
            setDetail(`${error.status || ""} ${error.message || ""}`.trim());
            throw error;
          }

          sessionStorage.setItem(doneKey, "1");
          sessionStorage.removeItem(key);

          // Limpieza URL para no re-ejecutar con refresh
          stripUrl();
          setProcessing(false);
          return;
        }

        // ✅ Caso B: Magic Link clásico -> token_hash + type (magiclink / recovery / signup)
        // Solo aceptamos magiclink/recovery/signup por seguridad.
        const allowed = ["magiclink", "recovery", "signup", "email_change"];
        const otpType = allowed.includes(input.type) ? (input.type as any) : ("magiclink" as any);

        const { error } = await supabase.auth.verifyOtp({
          token_hash: input.token_hash,
          type: otpType,
        });

        if (error) {
          setDetail(`${error.status || ""} ${error.message || ""}`.trim());
          throw error;
        }

        sessionStorage.setItem(doneKey, "1");
        sessionStorage.removeItem(key);

        stripUrl();
        setProcessing(false);
      } catch (e: any) {
        // error típico: "Email link is invalid or has expired"
        const msg =
          e?.message ||
          t("authCallback.invalidOrExpired", {
            defaultValue:
              "Email link inválido o expirado.\nCausas comunes: (1) el enlace ya fue usado, (2) fue abierto por un scanner del correo, o (3) hubo un refresh.\nSolicita un nuevo Magic Link.",
          });

        setError(msg);
        setProcessing(false);
        stripUrl();
      } finally {
        if (timeoutId) window.clearTimeout(timeoutId);
      }
    };

    run();
  }, [input, t]);

  // ✅ Redirección final por rol (cuando ya exista sesión y AuthContext haya cargado)
  useEffect(() => {
    if (processing) return;
    if (loading) return;
    if (!session) return;
    if (error) return;

    const r = String(role || "").toLowerCase();
    if (r === "tracker") {
      navigate("/tracker-gps", { replace: true });
    } else {
      navigate("/inicio", { replace: true });
    }
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
