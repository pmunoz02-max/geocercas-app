// src/pages/AuthCallback.tsx
// CALLBACK-V34 – Universal: soporta hash access_token Y PKCE code exchange
import React, { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase, setMemoryAccessToken } from "../supabaseClient";

type Diag = {
  step: string;
  next?: string;
  hasAccessToken?: boolean;
  hasCode?: boolean;
  bootstrapOrgId?: string;
  error?: string;
};

function parseHashParams(hash: string) {
  const h = (hash || "").startsWith("#") ? hash.slice(1) : hash || "";
  const sp = new URLSearchParams(h);
  const access_token = sp.get("access_token") || "";
  const refresh_token = sp.get("refresh_token") || "";
  const error = sp.get("error") || sp.get("error_description") || "";
  return { access_token, refresh_token, error };
}

function safeNext(raw: string | null | undefined) {
  const n = (raw || "").trim();
  if (!n || !n.startsWith("/")) return "/inicio";
  return n;
}

export default function AuthCallback() {
  const [searchParams] = useSearchParams();
  const fired = useRef(false);
  const [diag, setDiag] = useState<Diag>({ step: "idle" });

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    (async () => {
      const next = safeNext(searchParams.get("next") || "/inicio");
      try {
        setDiag({ step: "parse_url", next });

        const code = searchParams.get("code") || ""; // PKCE flow
        const { access_token, refresh_token, error } = parseHashParams(window.location.hash || "");

        setDiag({
          step: "parsed",
          next,
          hasAccessToken: !!access_token,
          hasCode: !!code,
          error: error || undefined,
        });

        // 1) error explícito desde supabase
        if (error) {
          const target = `/login?next=${encodeURIComponent(next)}&err=${encodeURIComponent(error)}`;
          try { window.history.replaceState({}, document.title, window.location.pathname + window.location.search); } catch {}
          window.location.replace(target);
          return;
        }

        // 2) Si vino en HASH (implicit)
        if (access_token) {
          setDiag({ step: "signout_local", next, hasAccessToken: true });
          try { await supabase.auth.signOut({ scope: "local" }); } catch {}

          // Si trae refresh_token, fija sesión completa
          if (refresh_token) {
            setDiag({ step: "set_session_from_hash", next, hasAccessToken: true });
            const { error: setErr } = await supabase.auth.setSession({ access_token, refresh_token });
            if (setErr) throw setErr;
          }

          setDiag({ step: "set_memory_token", next, hasAccessToken: true });
          setMemoryAccessToken(access_token);

          setDiag({ step: "bootstrap_rpc", next, hasAccessToken: true });
          const { data, error: rpcError } = await supabase.rpc("bootstrap_user_after_login");
          if (rpcError) throw rpcError;

          try { window.history.replaceState({}, document.title, window.location.pathname + window.location.search); } catch {}
          setDiag({ step: "redirect", next, bootstrapOrgId: data ? String(data) : undefined });
          window.location.replace(next);
          return;
        }

        // 3) Si vino en CODE (PKCE) → intercambiar por sesión
        if (code) {
          setDiag({ step: "exchange_code_for_session", next, hasCode: true });

          // Supabase-js v2: intercambia code por session y la guarda (persistSession=true lo persiste)
          const { data, error: exErr } = await supabase.auth.exchangeCodeForSession(window.location.href);
          if (exErr) throw exErr;

          const sess = data?.session;
          const at = sess?.access_token || "";
          if (!at) throw new Error("exchange_no_access_token");

          // Evita “sesión pegada” y asegura el token en memoria para tus RPC/fetch wrapper
          setDiag({ step: "set_memory_token", next, hasAccessToken: true });
          setMemoryAccessToken(at);

          setDiag({ step: "bootstrap_rpc", next, hasAccessToken: true });
          const { data: orgId, error: rpcError } = await supabase.rpc("bootstrap_user_after_login");
          if (rpcError) throw rpcError;

          try { window.history.replaceState({}, document.title, window.location.pathname + window.location.search); } catch {}
          setDiag({ step: "redirect", next, bootstrapOrgId: orgId ? String(orgId) : undefined });
          window.location.replace(next);
          return;
        }

        // 4) No vino ni hash token ni code
        const target = `/login?next=${encodeURIComponent(next)}&err=${encodeURIComponent("missing_access_token")}`;
        try { window.history.replaceState({}, document.title, window.location.pathname + window.location.search); } catch {}
        window.location.replace(target);
      } catch (e: any) {
        const msg = String(e?.message || e || "callback_error");
        setDiag({ step: "fatal", next, error: msg });
        const target = `/login?next=${encodeURIComponent(next)}&err=${encodeURIComponent(msg)}`;
        try { window.history.replaceState({}, document.title, window.location.pathname + window.location.search); } catch {}
        window.location.replace(target);
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
            <div>next: {diag.next || "-"}</div>
            <div>hasAccessToken: {String(diag.hasAccessToken ?? "-")}</div>
            <div>hasCode: {String(diag.hasCode ?? "-")}</div>
            <div>bootstrapOrgId: {diag.bootstrapOrgId || "-"}</div>
            <div>error: {diag.error || "-"}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
