// src/pages/AuthCallback.tsx
// CALLBACK-IMPLICIT-V1 — SOLO hash token (#access_token)
// Flujo:
// 1) Lee access_token del hash
// 2) setMemoryAccessToken(access_token)
// 3) POST /api/auth/bootstrap (Bearer) => Set-Cookie tg_at (HttpOnly)
// 4) Redirect a /inicio (o next)

import React, { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { setMemoryAccessToken } from "../lib/supabaseClient";

type Diag = {
  step: string;
  next?: string;
  hasAccessToken?: boolean;
  bootstrapOk?: boolean;
  error?: string;
};

function parseHashParams(hash: string) {
  const h = (hash || "").startsWith("#") ? hash.slice(1) : hash || "";
  const sp = new URLSearchParams(h);
  const access_token = sp.get("access_token") || "";
  const error = sp.get("error") || sp.get("error_description") || "";
  return { access_token, error };
}

function safeReplaceUrlWithoutSecrets() {
  try {
    window.history.replaceState({}, document.title, window.location.pathname);
  } catch {}
}

async function bootstrapBackendCookie(accessToken: string) {
  const res = await fetch("/api/auth/bootstrap", {
    method: "POST",
    credentials: "include",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "cache-control": "no-cache",
      pragma: "no-cache",
    },
    body: JSON.stringify({}),
  });

  let j: any = null;
  try {
    j = await res.json();
  } catch {}
  return { ok: res.ok && !!j?.ok, status: res.status, json: j };
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
      setDiag({ step: "parse_url", next });

      // ✅ Si llega ?code= es flujo PKCE viejo (lo desactivamos)
      const code = searchParams.get("code");
      if (code) {
        safeReplaceUrlWithoutSecrets();
        window.location.replace(
          `/login?next=${encodeURIComponent(next)}&err=${encodeURIComponent(
            "pkce_disabled_use_magic_link_implicit"
          )}`
        );
        return;
      }

      // ✅ Solo hash implicit
      const { access_token, error } = parseHashParams(window.location.hash || "");
      if (error) {
        safeReplaceUrlWithoutSecrets();
        window.location.replace(`/login?next=${encodeURIComponent(next)}&err=${encodeURIComponent(error)}`);
        return;
      }

      if (!access_token) {
        safeReplaceUrlWithoutSecrets();
        window.location.replace(
          `/login?next=${encodeURIComponent(next)}&err=${encodeURIComponent("missing_access_token_in_hash")}`
        );
        return;
      }

      setDiag({ step: "hash_ok", next, hasAccessToken: true });

      try {
        setMemoryAccessToken(access_token);
      } catch {}

      setDiag((d) => ({ ...d, step: "bootstrap_start" }));
      const boot = await bootstrapBackendCookie(access_token);
      setDiag((d) => ({ ...d, step: "bootstrap_done", bootstrapOk: boot.ok }));

      safeReplaceUrlWithoutSecrets();

      setDiag({ step: "redirect", next, hasAccessToken: true, bootstrapOk: boot.ok });
      window.location.replace(next);
    };

    void run();
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center px-4">
      <div className="w-full max-w-xl">
        <div className="bg-slate-900/70 p-10 rounded-[2.25rem] border border-slate-800 shadow-2xl">
          <h1 className="text-2xl font-semibold">Creando sesión...</h1>
          <p className="text-sm opacity-70 mt-2">Procesando Magic Link...</p>

          <div className="mt-6 text-xs bg-black/30 border border-white/10 rounded-2xl p-4 space-y-1">
            <div>step: {diag.step}</div>
            <div>next: {diag.next || "-"}</div>
            <div>hasAccessToken: {String(diag.hasAccessToken ?? "-")}</div>
            <div>bootstrapOk: {String(diag.bootstrapOk ?? "-")}</div>
            <div>error: {diag.error || "-"}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
