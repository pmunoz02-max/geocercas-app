// src/pages/AuthCallback.tsx
// CALLBACK-V33 – WebView/TWA safe:
// - NO setSession()
// - token en memoria (setMemoryAccessToken)
// - anti double-load: "callback ya procesado" en sessionStorage (1-uso + TTL)

import React, { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { setMemoryAccessToken } from "../supabaseClient";

type Diag = {
  step: string;
  next?: string;
  hasAccessToken?: boolean;
  error?: string;
  reusedDoneFlag?: boolean;
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

const DONE_KEY = "tg_authcb_done_v1";
const DONE_TTL_MS = 2 * 60 * 1000; // 2 minutos

type DonePayload = { ts: number; next: string };

function setDone(next: string) {
  try {
    const payload: DonePayload = { ts: Date.now(), next };
    sessionStorage.setItem(DONE_KEY, JSON.stringify(payload));
  } catch {}
}

function getDone(): DonePayload | null {
  try {
    const raw = sessionStorage.getItem(DONE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DonePayload;
    if (!parsed?.ts || !parsed?.next) return null;
    if (Date.now() - parsed.ts > DONE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function clearDone() {
  try {
    sessionStorage.removeItem(DONE_KEY);
  } catch {}
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
      const { access_token, error } = parseHashParams(window.location.hash || "");

      // ✅ Caso WebView/TWA: doble carga del callback SIN hash.
      // Si ya procesamos hace segundos, NO mandes a login: re-redirige al mismo next.
      if (!access_token && !error) {
        const done = getDone();
        if (done?.next) {
          setDiag({
            step: "reopen_without_hash_reuse_done",
            next: done.next,
            hasAccessToken: false,
            reusedDoneFlag: true,
          });

          // Limpia URL por si vuelve a cargar
          try {
            window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
          } catch {}

          window.location.replace(done.next);
          return;
        }
      }

      setDiag({
        step: "hash_parsed",
        next,
        hasAccessToken: !!access_token,
        error: error || undefined,
      });

      // Si Supabase devolvió error
      if (error) {
        const target = `/login?next=${encodeURIComponent(next)}&err=${encodeURIComponent(error)}`;
        try {
          window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
        } catch {}
        clearDone();
        window.location.replace(target);
        return;
      }

      if (!access_token) {
        const target = `/login?next=${encodeURIComponent(next)}&err=${encodeURIComponent("missing_access_token")}`;
        try {
          window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
        } catch {}
        clearDone();
        window.location.replace(target);
        return;
      }

      // ✅ Marca “procesado” ANTES de limpiar hash y redirigir (anti double-load)
      setDone(next);

      // ✅ Fuente de verdad: token en memoria (NO setSession)
      setDiag({ step: "set_memory_token", next, hasAccessToken: true });
      setMemoryAccessToken(access_token);

      // Limpia hash (evita re-proceso si la WebView reusa la URL)
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
      clearDone();
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
            <div>reusedDoneFlag: {String(diag.reusedDoneFlag ?? "-")}</div>
            <div>error: {diag.error || "-"}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
