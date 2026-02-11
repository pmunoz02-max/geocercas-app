// src/pages/AuthCallback.tsx
// CALLBACK-V33 – PKCE (?code=) + hash fallback
// TWA/WebView safe: NO setSession manual. Intercambia code y sincroniza cookie tg_at vía /api/auth/session.
import React, { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { setMemoryAccessToken } from "../lib/supabaseClient";

type Diag = {
  step: string;
  next?: string;
  mode?: "pkce" | "hash" | "unknown";
  hasCode?: boolean;
  hasAccessToken?: boolean;
  cookieSyncOk?: boolean;
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
  try {
    window.history.replaceState({}, document.title, window.location.pathname);
  } catch {}
}

async function syncBackendCookie(accessToken: string) {
  // Intentamos que el backend vea el Bearer y setee/renueve tg_at (HttpOnly).
  // Si el backend no soporta Authorization, igual no rompe: solo devolverá no-auth.
  const headers: Record<string, string> = {
    "cache-control": "no-cache",
    pragma: "no-cache",
  };
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

  const res = await fetch("/api/auth/session", {
    method: "GET",
    credentials: "include",
    headers,
  });

  // No forzamos parse; solo necesitamos saber si el backend ya quedó ok.
  return res.ok;
}

export default function AuthCallback() {
  const [searchParams] = useSearchParams();
  const fired = useRef(false);
  const [diag, setDiag] = useState<Diag>({ step: "idle" });

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    const run = async () => {
      const next = searchParams.get("next") || "/inicio";
      const code = searchParams.get("code") || "";

      try {
        setDiag({ step: "parse_url", next });

        // 1) PKCE code
        if (code) {
          setDiag({ step: "pkce_exchange_start", next, mode: "pkce", hasCode: true });

          // ✅ CORRECTO: pasar solo el code
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);

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

          // Token en memoria (tu arquitectura)
          if (accessToken) {
            try {
              setMemoryAccessToken(accessToken);
            } catch {}
          }

          // ✅ PASO CRÍTICO: sincronizar cookie HttpOnly tg_at en backend
          setDiag((d) => ({ ...d, step: "cookie_sync_start" }));
          const cookieOk = await syncBackendCookie(accessToken);
          setDiag((d) => ({ ...d, step: "cookie_sync_done", cookieSyncOk: cookieOk }));

          safeReplaceUrlWithoutSecrets();

          // Si cookie aún no ok, igual redirigimos: AuthContext intentará con Bearer mem-token.
          setDiag({ step: "redirect", next, mode: "pkce", hasCode: true, hasAccessToken: !!accessToken, cookieSyncOk: cookieOk });
          window.location.replace(next);
          return;
        }

        // 2) Hash fallback
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
          window.location.replace(`/login?next=${encodeURIComponent(next)}&err=${encodeURIComponent(error)}`);
          return;
        }

        if (!access_token) {
          setDiag({ step: "missing_code_and_token", next, mode: "unknown", hasAccessToken: false });
          safeReplaceUrlWithoutSecrets();
          window.location.replace(`/login?next=${encodeURIComponent(next)}&err=${encodeURIComponent("missing_code_or_token")}`);
          return;
        }

        try {
          setMemoryAccessToken(access_token);
        } catch {}

        setDiag((d) => ({ ...d, step: "cookie_sync_start" }));
        const cookieOk = await syncBackendCookie(access_token);
        setDiag((d) => ({ ...d, step: "cookie_sync_done", cookieSyncOk: cookieOk }));

        safeReplaceUrlWithoutSecrets();
        setDiag({ step: "redirect", next, mode: "hash", hasAccessToken: true, cookieSyncOk: cookieOk });
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
            <div>cookieSyncOk: {String(diag.cookieSyncOk ?? "-")}</div>
            <div>error: {diag.error || "-"}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
