// src/pages/AuthCallback.tsx
// CALLBACK-V32 – soporta PKCE (?code=) + hash tokens (#access_token=)
// TWA/WebView safe: NO setSession manual. Usa exchangeCodeForSession cuando hay code.
import React, { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

// Si mantienes token en memoria para tu cliente custom, lo usamos si existe.
// Si NO lo tienes, comenta estas 2 líneas y listo.
import { setMemoryAccessToken } from "../supabaseClient";

type Diag = {
  step: string;
  next?: string;
  mode?: "pkce" | "hash" | "unknown";
  hasCode?: boolean;
  hasAccessToken?: boolean;
  error?: string;
};

function parseHashParams(hash: string) {
  const h = (hash || "").startsWith("#") ? hash.slice(1) : hash || "";
  const sp = new URLSearchParams(h);
  const access_token = sp.get("access_token") || "";
  const refresh_token = sp.get("refresh_token") || "";
  const token_type = sp.get("token_type") || "";
  const expires_in = sp.get("expires_in") || "";
  const error = sp.get("error") || sp.get("error_description") || "";
  return { access_token, refresh_token, token_type, expires_in, error };
}

function safeReplaceUrlWithoutSecrets() {
  // Limpia query/hash para evitar reprocesos y no dejar tokens/codes en URL
  try {
    window.history.replaceState({}, document.title, window.location.pathname);
  } catch {
    // ignore
  }
}

export default function AuthCallback() {
  const [searchParams] = useSearchParams();
  const fired = useRef(false);
  const [diag, setDiag] = useState<Diag>({ step: "idle" });

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    const run = async () => {
      // next default: manda al panel. Cambia aquí si tu panel es otra ruta.
      const next = searchParams.get("next") || "/inicio";
      const code = searchParams.get("code") || "";

      try {
        setDiag({ step: "parse_url", next });

        // 1) Si viene PKCE code (?code=...), hacer exchange
        if (code) {
          setDiag({ step: "pkce_exchange_start", next, mode: "pkce", hasCode: true });

          const { data, error } = await supabase.auth.exchangeCodeForSession(window.location.href);

          if (error) {
            setDiag({ step: "pkce_exchange_error", next, mode: "pkce", hasCode: true, error: error.message });
            safeReplaceUrlWithoutSecrets();
            window.location.replace(`/login?next=${encodeURIComponent(next)}&err=${encodeURIComponent(error.message)}`);
            return;
          }

          const accessToken = data?.session?.access_token || "";
          setDiag({
            step: "pkce_exchange_ok",
            next,
            mode: "pkce",
            hasCode: true,
            hasAccessToken: !!accessToken,
          });

          // Si tu app usa token en memoria además de cookies, lo seteamos.
          if (accessToken) {
            try {
              setMemoryAccessToken(accessToken);
            } catch {
              // ignore si no aplica
            }
          }

          safeReplaceUrlWithoutSecrets();
          setDiag({ step: "redirect", next, mode: "pkce", hasCode: true, hasAccessToken: !!accessToken });
          window.location.replace(next);
          return;
        }

        // 2) Si no hay code, intentar modo hash (#access_token=...)
        const { access_token, error } = parseHashParams(window.location.hash || "");
        setDiag({
          step: "hash_parsed",
          next,
          mode: "hash",
          hasAccessToken: !!access_token,
          error: error || undefined,
        });

        if (error) {
          safeReplaceUrlWithoutSecrets();
          window.location.replace(
            `/login?next=${encodeURIComponent(next)}&err=${encodeURIComponent(error)}`
          );
          return;
        }

        if (!access_token) {
          // No hay ni code ni hash tokens
          setDiag({ step: "missing_code_and_token", next, mode: "unknown", hasAccessToken: false });
          safeReplaceUrlWithoutSecrets();
          window.location.replace(
            `/login?next=${encodeURIComponent(next)}&err=${encodeURIComponent("missing_code_or_token")}`
          );
          return;
        }

        // Token hash: guardarlo en memoria (si tu app lo usa)
        try {
          setMemoryAccessToken(access_token);
        } catch {
          // ignore
        }

        safeReplaceUrlWithoutSecrets();
        setDiag({ step: "redirect", next, mode: "hash", hasAccessToken: true });
        window.location.replace(next);
      } catch (e: any) {
        const msg = String(e?.message || e || "callback_error");
        setDiag({ step: "fatal", next, error: msg });
        safeReplaceUrlWithoutSecrets();
        window.location.replace(`/login?next=${encodeURIComponent(next)}&err=${encodeURIComponent(msg)}`);
      }
    };

    void run();
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center px-4">
      <div className="w-full max-w-xl">
        <div className="bg-slate-900/70 p-10 rounded-[2.25rem] border border-slate-800 shadow-2xl">
          <h1 className="text-2xl font-semibold">Creando sesión...</h1>
          <p className="text-sm opacity-70 mt-2">Un momento...</p>

          <div className="mt-6 text-xs bg-black/30 border border-white/10 rounded-2xl p-4 space-y-1">
            <div>step: {diag.step}</div>
            <div>mode: {diag.mode || "-"}</div>
            <div>next: {diag.next || "-"}</div>
            <div>hasCode: {String(diag.hasCode ?? "-")}</div>
            <div>hasAccessToken: {String(diag.hasAccessToken ?? "-")}</div>
            <div>error: {diag.error || "-"}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
