// src/pages/AuthCallback.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

type Step = "working" | "success" | "error";

function isTrackerHostname(hostname: string) {
  const h = String(hostname || "").toLowerCase().trim();
  return h === "tracker.tugeocercas.com" || h.startsWith("tracker.");
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timeout en ${label}`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

function parseHashTokens(hash: string) {
  const raw = (hash || "").startsWith("#") ? hash.slice(1) : hash || "";
  const params = new URLSearchParams(raw);
  const access_token = params.get("access_token") || "";
  const refresh_token = params.get("refresh_token") || "";
  return { access_token, refresh_token };
}

function normalizeType(t: string) {
  return String(t || "").toLowerCase().trim();
}

async function verifyWithFallbackTypes(token_hash: string, incomingType?: string) {
  const primary = normalizeType(incomingType);
  const candidates = [
    primary,
    "invite",
    "magiclink",
    "signup",
    "recovery",
    "email_change",
  ].filter(Boolean);

  // evitar duplicados manteniendo orden
  const seen = new Set<string>();
  const ordered = candidates.filter((x) => {
    if (seen.has(x)) return false;
    seen.add(x);
    return true;
  });

  let lastErr: any = null;

  for (const type of ordered) {
    try {
      const { error } = await withTimeout(
        supabase.auth.verifyOtp({
          token_hash,
          type: type as any,
        }),
        15000,
        `verifyOtp(${type})`
      );
      if (!error) return { ok: true, usedType: type };
      lastErr = error;
    } catch (e) {
      lastErr = e;
    }
  }

  return { ok: false, error: lastErr, tried: ordered };
}

export default function AuthCallback() {
  const location = useLocation();
  const navigate = useNavigate();

  const trackerDomain = useMemo(
    () => isTrackerHostname(window.location.hostname),
    []
  );

  const [step, setStep] = useState<Step>("working");
  const [message, setMessage] = useState("Estableciendo sesión…");
  const [detail, setDetail] = useState("");

  useEffect(() => {
    let alive = true;

    const run = async () => {
      try {
        setStep("working");
        setMessage("Estableciendo sesión…");
        setDetail("");

        const searchParams = new URLSearchParams(location.search);

        const token_hash = searchParams.get("token_hash") || "";
        const type = searchParams.get("type") || "";

        const code = searchParams.get("code") || "";
        const { access_token, refresh_token } = parseHashTokens(location.hash);

        if (token_hash) {
          setMessage("Verificando enlace…");

          const res = await verifyWithFallbackTypes(token_hash, type);
          if (!res.ok) {
            const msg =
              res?.error?.message ||
              "No se pudo verificar el enlace. Puede haber expirado o estar mal formateado.";
            throw new Error(
              `${msg}\n\nTipos probados: ${(res as any).tried?.join(", ")}`
            );
          }
        } else if (code) {
          setMessage("Intercambiando código por sesión…");
          await withTimeout(
            supabase.auth.exchangeCodeForSession(code),
            15000,
            "exchangeCodeForSession"
          );
        } else if (access_token && refresh_token) {
          setMessage("Aplicando tokens de sesión…");
          await withTimeout(
            supabase.auth.setSession({ access_token, refresh_token }),
            15000,
            "setSession"
          );
        } else {
          throw new Error(
            "Falta el parámetro de autenticación (no llegó token_hash ni ?code=... ni #access_token=...). Revisa los Email Templates de Supabase."
          );
        }

        setMessage("Confirmando sesión…");
        const { data, error } = await withTimeout(
          supabase.auth.getSession(),
          15000,
          "getSession"
        );
        if (error) throw error;

        const sess = data?.session ?? null;
        if (!sess) {
          throw new Error(
            "No se pudo confirmar la sesión (session=null). Verifica cookies/dominio y Redirect URLs."
          );
        }

        setMessage("Redirigiendo…");
        if (!alive) return;
        setStep("success");

        // destino por dominio
        if (trackerDomain) navigate("/tracker-gps", { replace: true });
        else navigate("/inicio", { replace: true });
      } catch (e: any) {
        console.error("[AuthCallback] error:", e);
        if (!alive) return;
        setStep("error");
        setMessage("Ocurrió un problema.");
        setDetail(e?.message || String(e));
      }
    };

    run();

    return () => {
      alive = false;
    };
  }, [location.search, location.hash, navigate, trackerDomain]);

  const goLogin = () => navigate("/login", { replace: true });
  const retry = () => window.location.reload();

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white border rounded-2xl p-6 space-y-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">App Geocercas</h1>
          <p className="text-sm text-slate-600">{message}</p>
        </div>

        {step === "working" && (
          <div className="text-sm text-slate-500">Procesando…</div>
        )}

        {step === "error" && (
          <>
            <div className="border border-red-200 bg-red-50 p-3 rounded-lg">
              <div className="text-sm font-semibold text-red-800">
                Ocurrió un problema.
              </div>
              <div className="mt-1 text-sm text-red-700 whitespace-pre-line">
                {detail}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={goLogin}
                className="flex-1 rounded-xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white hover:bg-sky-500 transition"
              >
                Ir a Login
              </button>
              <button
                onClick={retry}
                className="flex-1 rounded-xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white hover:bg-sky-500 transition"
              >
                Reintentar
              </button>
            </div>

            <div className="text-xs text-slate-400">
              Si el mensaje dice “invalid or expired” incluso con un link nuevo,
              normalmente es un mismatch de <code>type</code>. Este callback ya
              prueba automáticamente: invite, magiclink, signup, recovery.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
