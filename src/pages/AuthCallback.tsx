// src/pages/AuthCallback.tsx
// CALLBACK-V36 – Soporta:
// - Invite/MagicLink: token_hash&type=invite|magiclink|recovery  => verifyOtp()
// - OAuth/PKCE: ?code=...                                     => exchangeCodeForSession()
// - Hash access_token (TWA/WebView legacy)                    => setMemoryAccessToken()
// Siempre redirige a next (default /inicio)

import React, { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase, setMemoryAccessToken } from "../supabaseClient";

type Diag = {
  step: string;
  next?: string;
  hasAccessToken?: boolean;
  error?: string;
  mode?: string;
};

function parseHashParams(hash: string) {
  const h = (hash || "").startsWith("#") ? hash.slice(1) : hash || "";
  const sp = new URLSearchParams(h);
  const access_token = sp.get("access_token") || "";
  const error = sp.get("error") || sp.get("error_description") || "";
  return { access_token, error };
}

export default function AuthCallback() {
  const [searchParams] = useSearchParams();
  const fired = useRef(false);
  const [diag, setDiag] = useState<Diag>({ step: "idle" });

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    (async () => {
      try {
        setDiag({ step: "parse_url" });

        const next = searchParams.get("next") || "/inicio";

        // 1) Invite/MagicLink por query: token_hash + type
        const token_hash = searchParams.get("token_hash") || "";
        const type = (searchParams.get("type") || "").toLowerCase(); // invite | magiclink | recovery | ...

        if (token_hash && type) {
          setDiag({ step: "verify_otp_start", next, mode: `verifyOtp:${type}` });

          const { data, error } = await supabase.auth.verifyOtp({
            token_hash,
            type: type as any,
          });

          if (error) {
            const msg = error.message || "verify_otp_error";
            setDiag({ step: "verify_otp_error", next, error: msg, mode: `verifyOtp:${type}` });
            window.location.replace(`/login?next=${encodeURIComponent(next)}&err=${encodeURIComponent(msg)}`);
            return;
          }

          const accessToken = data?.session?.access_token || "";
          if (!accessToken) {
            const msg = "missing_access_token_after_verifyOtp";
            setDiag({ step: "verify_otp_no_token", next, error: msg, mode: `verifyOtp:${type}` });
            window.location.replace(`/login?next=${encodeURIComponent(next)}&err=${encodeURIComponent(msg)}`);
            return;
          }

          setDiag({ step: "set_memory_token", next, hasAccessToken: true, mode: `verifyOtp:${type}` });
          setMemoryAccessToken(accessToken);

          setDiag({ step: "redirect", next, hasAccessToken: true, mode: `verifyOtp:${type}` });
          window.location.replace(next);
          return;
        }

        // 2) OAuth/PKCE por query: code
        const code = searchParams.get("code") || "";
        if (code) {
          setDiag({ step: "exchange_code_start", next, mode: "exchangeCodeForSession" });

          const { data, error } = await supabase.auth.exchangeCodeForSession(code);

          if (error) {
            const msg = error.message || "exchange_code_error";
            setDiag({ step: "exchange_code_error", next, error: msg, mode: "exchangeCodeForSession" });
            window.location.replace(`/login?next=${encodeURIComponent(next)}&err=${encodeURIComponent(msg)}`);
            return;
          }

          const accessToken = data?.session?.access_token || "";
          if (!accessToken) {
            const msg = "missing_access_token_after_exchange";
            setDiag({ step: "exchange_code_no_token", next, error: msg, mode: "exchangeCodeForSession" });
            window.location.replace(`/login?next=${encodeURIComponent(next)}&err=${encodeURIComponent(msg)}`);
            return;
          }

          setDiag({ step: "set_memory_token", next, hasAccessToken: true, mode: "exchangeCodeForSession" });
          setMemoryAccessToken(accessToken);

          setDiag({ step: "redirect", next, hasAccessToken: true, mode: "exchangeCodeForSession" });
          window.location.replace(next);
          return;
        }

        // 3) Hash access_token (tu flujo TWA/WebView legacy)
        const { access_token, error } = parseHashParams(window.location.hash || "");
        setDiag({ step: "hash_parsed", next, hasAccessToken: !!access_token, error: error || undefined, mode: "hash" });

        if (error) {
          window.location.replace(`/login?next=${encodeURIComponent(next)}&err=${encodeURIComponent(error)}`);
          return;
        }

        if (!access_token) {
          const msg = "missing_access_token";
          window.location.replace(`/login?next=${encodeURIComponent(next)}&err=${encodeURIComponent(msg)}`);
          return;
        }

        setDiag({ step: "set_memory_token", next, hasAccessToken: true, mode: "hash" });
        setMemoryAccessToken(access_token);

        setDiag({ step: "redirect", next, hasAccessToken: true, mode: "hash" });
        window.location.replace(next);
      } catch (e: any) {
        const msg = String(e?.message || e || "callback_error");
        const next = searchParams.get("next") || "/inicio";
        setDiag({ step: "fatal", error: msg, next });
        window.location.replace(`/login?next=${encodeURIComponent(next)}&err=${encodeURIComponent(msg)}`);
      }
    })();
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
            <div>hasAccessToken: {String(diag.hasAccessToken ?? "-")}</div>
            <div>error: {diag.error || "-"}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
