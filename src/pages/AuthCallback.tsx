// src/pages/AuthCallback.tsx
// CALLBACK-IMPLICIT-V2 — hash token (#access_token)
// - login normal: bootstrap cookie y redirige a next (limpia hash)
// - recovery: reenvía el hash completo hacia /reset-password (NO limpiar antes)

import React, { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { setMemoryAccessToken } from "../lib/supabaseClient";

type Diag = {
  step: string;
  next?: string;
  type?: string;
  hasAccessToken?: boolean;
  bootstrapOk?: boolean;
  error?: string;
};

function parseHashParams(hash: string) {
  const h = (hash || "").startsWith("#") ? hash.slice(1) : hash || "";
  const sp = new URLSearchParams(h);
  const access_token = sp.get("access_token") || "";
  const refresh_token = sp.get("refresh_token") || "";
  const type = (sp.get("type") || "").toLowerCase(); // recovery / magiclink / etc
  const error = sp.get("error") || sp.get("error_description") || "";
  return { access_token, refresh_token, type, error };
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

      // Si llega ?code= es PKCE viejo
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

      const { access_token, refresh_token, type, error } = parseHashParams(
        window.location.hash || ""
      );

      setDiag({ step: "hash_parsed", next, type });

      if (error) {
        safeReplaceUrlWithoutSecrets();
        window.location.replace(
          `/login?next=${encodeURIComponent(next)}&err=${encodeURIComponent(
            error
          )}`
        );
        return;
      }

      if (!access_token) {
        safeReplaceUrlWithoutSecrets();
        window.location.replace(
          `/login?next=${encodeURIComponent(next)}&err=${encodeURIComponent(
            "missing_access_token_in_hash"
          )}`
        );
        return;
      }

      // ✅ CASO RECOVERY: reenviar el hash COMPLETO a /reset-password
      // (no limpies hash antes, o se pierde access_token/refresh_token)
      if (type === "recovery") {
        // Si next ya apunta a reset-password, respétalo, sino fuerza /reset-password
        const target =
          next && next.startsWith("/reset-password")
            ? next
            : "/reset-password";

        setDiag({
          step: "recovery_forward_hash",
          next: target,
          type,
          hasAccessToken: true,
        });

        // Reenviamos hash tal cual llegó
        window.location.replace(`${target}${window.location.hash}`);
        return;
      }

      // ✅ LOGIN NORMAL: set token en memoria + bootstrap cookie
      setDiag({ step: "hash_ok", next, type, hasAccessToken: true });

      try {
        setMemoryAccessToken(access_token);
      } catch {}

      setDiag((d) => ({ ...d, step: "bootstrap_start" }));
      const boot = await bootstrapBackendCookie(access_token);
      setDiag((d) => ({ ...d, step: "bootstrap_done", bootstrapOk: boot.ok }));

      // ✅ ahora sí limpiamos hash (ya no lo necesitamos)
      safeReplaceUrlWithoutSecrets();

      setDiag({
        step: "redirect",
        next,
        type,
        hasAccessToken: true,
        bootstrapOk: boot.ok,
      });
      window.location.replace(next);
    };

    void run();
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center px-4">
      <div className="w-full max-w-xl">
        <div className="bg-slate-900/70 p-10 rounded-[2.25rem] border border-slate-800 shadow-2xl">
          <h1 className="text-2xl font-semibold">Creando sesión...</h1>
          <p className="text-sm opacity-70 mt-2">
            Procesando link de autenticación...
          </p>

          <div className="mt-6 text-xs bg-black/30 border border-white/10 rounded-2xl p-4 space-y-1">
            <div>step: {diag.step}</div>
            <div>type: {diag.type || "-"}</div>
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
