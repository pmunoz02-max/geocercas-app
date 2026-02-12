// src/pages/AuthCallback.tsx
// CALLBACK-IMPLICIT-V3 — soporta token en hash (#access_token) y fallback en query (?access_token=...)
// - login normal: bootstrap cookie y redirige a next (limpia hash/query)
// - recovery: reenvía el hash completo hacia /reset-password (NO limpiar antes)
// - si llega ?code= (PKCE): redirige a login con error explícito

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
  seenCode?: boolean;
  url?: string;
};

function parseHashParams(hash: string) {
  const h = (hash || "").startsWith("#") ? hash.slice(1) : hash || "";
  const sp = new URLSearchParams(h);
  const access_token = sp.get("access_token") || "";
  const refresh_token = sp.get("refresh_token") || "";
  const type = (sp.get("type") || "").toLowerCase();
  const error = sp.get("error") || sp.get("error_description") || "";
  return { access_token, refresh_token, type, error };
}

function parseQueryToken(searchParams: URLSearchParams) {
  // Fallback (algunos providers mandan token en query)
  const access_token =
    searchParams.get("access_token") ||
    searchParams.get("token") ||
    searchParams.get("accessToken") ||
    "";
  const type = (searchParams.get("type") || "").toLowerCase();
  const error =
    searchParams.get("error") ||
    searchParams.get("error_description") ||
    "";
  return { access_token, type, error };
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

      setDiag({
        step: "parse_url",
        next,
        url:
          typeof window !== "undefined"
            ? window.location.href
            : "unknown_url",
      });

      // Si llega ?code= (PKCE)
      const code = searchParams.get("code");
      if (code) {
        safeReplaceUrlWithoutSecrets();
        window.location.replace(
          `/login?next=${encodeURIComponent(next)}&err=${encodeURIComponent(
            "pkce_link_received_but_pkce_disabled"
          )}`
        );
        return;
      }

      // 1) Intento: HASH (ideal)
      const hashParsed = parseHashParams(window.location.hash || "");
      let accessToken = hashParsed.access_token;
      let type = hashParsed.type;
      let error = hashParsed.error;

      setDiag((d) => ({
        ...d,
        step: "hash_parsed",
        next,
        type,
        hasAccessToken: Boolean(accessToken),
        error: error || "",
      }));

      // 2) Fallback: query token (por si el proveedor lo manda así)
      if (!accessToken) {
        const q = parseQueryToken(searchParams);
        accessToken = q.access_token || "";
        type = type || q.type || "";
        error = error || q.error || "";

        setDiag((d) => ({
          ...d,
          step: "query_fallback_parsed",
          next,
          type,
          hasAccessToken: Boolean(accessToken),
          error: error || "",
        }));
      }

      if (error) {
        safeReplaceUrlWithoutSecrets();
        window.location.replace(
          `/login?next=${encodeURIComponent(next)}&err=${encodeURIComponent(
            error
          )}`
        );
        return;
      }

      if (!accessToken) {
        // Esto nos dice que el link NO trajo token (ni hash ni query)
        safeReplaceUrlWithoutSecrets();
        window.location.replace(
          `/login?next=${encodeURIComponent(next)}&err=${encodeURIComponent(
            "missing_access_token_in_hash_or_query"
          )}`
        );
        return;
      }

      // ✅ CASO RECOVERY: reenviar el hash COMPLETO a /reset-password
      // (si vino por hash; si vino por query, igual mandamos query al reset-password)
      if (type === "recovery") {
        const target =
          next && next.startsWith("/reset-password")
            ? next
            : "/reset-password";

        setDiag({
          step: "recovery_forward",
          next: target,
          type,
          hasAccessToken: true,
        });

        if (window.location.hash) {
          window.location.replace(`${target}${window.location.hash}`);
        } else {
          const qs = new URLSearchParams();
          qs.set("access_token", accessToken);
          qs.set("type", "recovery");
          window.location.replace(`${target}?${qs.toString()}`);
        }
        return;
      }

      // ✅ LOGIN NORMAL: set token en memoria + bootstrap cookie
      setDiag({ step: "token_ok", next, type, hasAccessToken: true });

      try {
        setMemoryAccessToken(accessToken);
      } catch {}

      setDiag((d) => ({ ...d, step: "bootstrap_start" }));
      const boot = await bootstrapBackendCookie(accessToken);
      setDiag((d) => ({ ...d, step: "bootstrap_done", bootstrapOk: boot.ok }));

      // ✅ limpia URL
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
            <div className="opacity-60 break-all">url: {diag.url || "-"}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
