// src/pages/AuthCallback.tsx
// CALLBACK-V34 – PKCE (?code=) + hash fallback
// TWA/WebView safe: NO setSession manual. Intercambia code y crea cookie tg_at vía /api/auth/bootstrap.
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
  bootstrapOk?: boolean;
  sessionOk?: boolean;
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

async function bootstrapBackendCookie(accessToken: string) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "cache-control": "no-cache",
    pragma: "no-cache",
  };
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

  const res = await fetch("/api/auth/bootstrap", {
    method: "POST",
    credentials: "include", // necesario para aceptar Set-Cookie
    headers,
    body: JSON.stringify({}),
  });

  let j: any = null;
  try {
    j = await res.json();
  } catch {}

  return { ok: res.ok && !!j?.ok, status: res.status, json: j };
}

async function checkSession() {
  const res = await fetch("/api/auth/session", {
    method: "GET",
    credentials: "include",
    headers: { "cache-control": "no-cache", pragma: "no-cache" },
  });

  let j: any = null;
  try {
    j = await res.json();
  } catch {}

  return { ok: res.ok && !!j?.ok && !!j?.authenticated, status: res.status, json: j };
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

          const { data, error } = await supabase.auth.exchangeCodeForSession(code);

          if (error) {
            setDiag({
              step: "pkce_exchange_error",
              next,
              mode: "pkce",
              hasCode: true,
              error: error.message,
            });
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

          // ✅ PASO CRÍTICO: crear cookie HttpOnly tg_at en backend
          setDiag((d) => ({ ...d, step: "bootstrap_start" }));
          const boot = await bootstrapBackendCookie(accessToken);
          setDiag((d) => ({ ...d, step: "bootstrap_done", bootstrapOk: boot.ok }));

          // (Opcional) comprobar sesión por cookie
          setDiag((d) => ({ ...d, step: "session_check_start" }));
          const sess = await checkSession();
          setDiag((d) => ({ ...d, step: "session_check_done", sessionOk: sess.ok }));

          safeReplaceUrlWithoutSecrets();

          setDiag({
            step: "redirect",
            next,
            mode: "pkce",
            hasCode: true,
            hasAccessToken: !!accessToken,
            bootstrapOk: boot.ok,
            sessionOk: sess.ok,
          });

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

        setDiag((d) => ({ ...d, step: "bootstrap_start" }));
        const boot = await bootstrapBackendCookie(access_token);
        setDiag((d) => ({ ...d, step: "bootstrap_done", bootstrapOk: boot.ok }));

        setDiag((d) => ({ ...d, step: "session_check_start" }));
        const sess = await checkSession();
        setDiag((d) => ({ ...d, step: "session_check_done", sessionOk: sess.ok }));

        safeReplaceUrlWithoutSecrets();
        setDiag({
          step: "redirect",
          next,
          mode: "hash",
          hasAccessToken: true,
          bootstrapOk: boot.ok,
          sessionOk: sess.ok,
        });
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
            <div>bootstrapOk: {String(diag.bootstrapOk ?? "-")}</div>
            <div>sessionOk: {String(diag.sessionOk ?? "-")}</div>
            <div>error: {diag.error || "-"}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
