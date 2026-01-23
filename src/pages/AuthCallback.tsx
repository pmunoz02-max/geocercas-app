// src/pages/AuthCallback.tsx
// CALLBACK-V32 – WebView/TWA safe: NO setSession(), token en memoria + sessionStorage 1-uso + redirect
import React, { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { setMemoryAccessToken } from "../supabaseClient";

type Diag = {
  step: string;
  next?: string;
  hasAccessToken?: boolean;
  error?: string;
};

type CachedTokens = {
  access_token: string;
  ts: number; // epoch ms
};

const SS_KEY = "tg_cb_access_token_v1";
const SS_TTL_MS = 2 * 60 * 1000; // 2 minutos (suficiente para 1 loop de WebView)

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

function ssWriteAccessTokenOnce(access_token: string) {
  try {
    const payload: CachedTokens = { access_token, ts: Date.now() };
    sessionStorage.setItem(SS_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

function ssReadAccessTokenOnce(): string {
  try {
    const raw = sessionStorage.getItem(SS_KEY);
    if (!raw) return "";
    sessionStorage.removeItem(SS_KEY); // 1-uso SIEMPRE
    const parsed = JSON.parse(raw) as CachedTokens;
    if (!parsed?.access_token || !parsed?.ts) return "";
    if (Date.now() - parsed.ts > SS_TTL_MS) return "";
    return String(parsed.access_token || "");
  } catch {
    try {
      sessionStorage.removeItem(SS_KEY);
    } catch {}
    return "";
  }
}

export default function AuthCallback() {
  const [searchParams] = useSearchParams();
  const fired = useRef(false);

  const [diag, setDiag] = useState<Diag>({ step: "idle" });

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    try {
      setDiag({ step: "parse_url" });

      const next = searchParams.get("next") || "/inicio";

      // 1) Intenta leer tokens del hash (camino normal)
      const { access_token: hashAT, error } = parseHashParams(window.location.hash || "");

      // 2) Si no hay hash token, intenta recuperar 1-vez desde sessionStorage (anti WebView double-load)
      const recoveredAT = !hashAT ? ssReadAccessTokenOnce() : "";

      const access_token = hashAT || recoveredAT;

      setDiag({
        step: "tokens_resolved",
        next,
        hasAccessToken: !!access_token,
        error: error || undefined,
      });

      // Si Supabase devolvió error explícito
      if (error) {
        const target = `/login?next=${encodeURIComponent(next)}&err=${encodeURIComponent(error)}`;
        // Limpia hash/URL del callback para evitar re-proceso
        try {
          window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
        } catch {}
        window.location.replace(target);
        return;
      }

      if (!access_token) {
        const target = `/login?next=${encodeURIComponent(next)}&err=${encodeURIComponent("missing_access_token")}`;
        try {
          window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
        } catch {}
        window.location.replace(target);
        return;
      }

      // ✅ Antes de limpiar hash: guarda token 1-vez por si la WebView re-carga el callback sin hash
      if (hashAT) ssWriteAccessTokenOnce(hashAT);

      // ✅ Fuente de verdad: token en memoria (NO setSession)
      setDiag({ step: "set_memory_token", next, hasAccessToken: true });
      setMemoryAccessToken(access_token);

      // Limpia hash para evitar re-proceso si la WebView reusa la URL
      try {
        window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
      } catch {}

      // ✅ Redirección directa
      setDiag({ step: "redirect", next, hasAccessToken: true });
      window.location.replace(next);
    } catch (e: any) {
      const msg = String(e?.message || e || "callback_error");
      setDiag({ step: "fatal", error: msg });

      const next = searchParams.get("next") || "/inicio";
      const target = `/login?next=${encodeURIComponent(next)}&err=${encodeURIComponent(msg)}`;
      try {
        window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
      } catch {}
      window.location.replace(target);
    }
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center px-4">
      <div className="w-full max-w-xl">
        <div className="bg-slate-900/70 p-10 rounded-[2.25rem] border border-slate-800 shadow-2xl">
          <h1 className="text-2xl font-semibold">Creando sesión...</h1>
          <p className="text-sm opacity-70 mt-2">Un momento...</p>

          <div className="mt-6 text-xs bg-black/30 border border-white/10 rounded-2xl p-4 space-y-1">
            <div>step: {diag.step}</div>
            <div>next: {diag.next || "-"}</div>
            <div>hasAccessToken: {String(diag.hasAccessToken ?? "-")}</div>
            <div>error: {diag.error || "-"}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
