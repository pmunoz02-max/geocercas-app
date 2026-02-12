// src/pages/AuthCallback.tsx
<<<<<<< HEAD
// CALLBACK-V35 – Universal: hash token | PKCE code | token_hash+type (verifyOtp) | fallback getSession
import React, { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase, setMemoryAccessToken } from "../supabaseClient";
=======
// CALLBACK-IMPLICIT-V2 — hash token (#access_token)
// - login normal: bootstrap cookie y redirige a next (limpia hash)
// - recovery: reenvía el hash completo hacia /reset-password (NO limpiar antes)

import React, { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { setMemoryAccessToken } from "../lib/supabaseClient";
>>>>>>> preview

type Diag = {
  step: string;
  next?: string;
  type?: string;
  hasAccessToken?: boolean;
<<<<<<< HEAD
  hasCode?: boolean;
  hasTokenHash?: boolean;
  otpType?: string;
  bootstrapOrgId?: string;
=======
  bootstrapOk?: boolean;
>>>>>>> preview
  error?: string;
};

function parseHashParams(hash: string) {
  const h = (hash || "").startsWith("#") ? hash.slice(1) : hash || "";
  const sp = new URLSearchParams(h);
  const access_token = sp.get("access_token") || "";
  const refresh_token = sp.get("refresh_token") || "";
<<<<<<< HEAD
  const error = sp.get("error") || sp.get("error_description") || "";
  return { access_token, refresh_token, error };
}

function safeNext(raw: string | null | undefined) {
  const n = (raw || "").trim();
  if (!n || !n.startsWith("/")) return "/inicio";
  return n;
}

async function bootstrapAndRedirect(next: string, accessToken: string) {
  // Token en memoria para tu fetch wrapper / RPC
  setMemoryAccessToken(accessToken);

  const { data: orgId, error: rpcError } = await supabase.rpc("bootstrap_user_after_login");
  if (rpcError) throw rpcError;

  try {
    window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
  } catch {}

  window.location.replace(next);
  return orgId ? String(orgId) : undefined;
=======
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
>>>>>>> preview
}

export default function AuthCallback() {
  const [searchParams] = useSearchParams();
  const fired = useRef(false);
  const [diag, setDiag] = useState<Diag>({ step: "idle" });

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

<<<<<<< HEAD
    (async () => {
      const next = safeNext(searchParams.get("next") || "/inicio");

      try {
        setDiag({ step: "parse_url", next });

        const code = searchParams.get("code") || "";
        const token_hash = searchParams.get("token_hash") || "";
        const type = searchParams.get("type") || ""; // magiclink | recovery | invite | email_change ...

        const { access_token, refresh_token, error } = parseHashParams(window.location.hash || "");

        setDiag({
          step: "parsed",
          next,
          hasAccessToken: !!access_token,
          hasCode: !!code,
          hasTokenHash: !!token_hash,
          otpType: type || undefined,
          error: error || undefined,
        });

        // error explícito
        if (error) {
          const target = `/login?next=${encodeURIComponent(next)}&err=${encodeURIComponent(error)}`;
          window.location.replace(target);
          return;
        }

        // 1) HASH token (legacy)
        if (access_token) {
          setDiag({ step: "hash_token_flow", next, hasAccessToken: true });

          // Evita “sesión pegada”
          try {
            await supabase.auth.signOut({ scope: "local" });
          } catch {}

          // Si hay refresh_token, fija sesión completa
          if (refresh_token) {
            const { error: setErr } = await supabase.auth.setSession({
              access_token,
              refresh_token,
            });
            if (setErr) throw setErr;
          }

          setDiag({ step: "bootstrap_rpc", next, hasAccessToken: true });
          const orgId = await bootstrapAndRedirect(next, access_token);
          setDiag({ step: "redirect", next, bootstrapOrgId: orgId });
          return;
        }

        // 2) PKCE code flow
        if (code) {
          setDiag({ step: "pkce_exchange", next, hasCode: true });

          const { data, error: exErr } = await supabase.auth.exchangeCodeForSession(window.location.href);
          if (exErr) throw exErr;

          const at = data?.session?.access_token || "";
          if (!at) throw new Error("exchange_no_access_token");

          setDiag({ step: "bootstrap_rpc", next, hasAccessToken: true });
          const orgId = await bootstrapAndRedirect(next, at);
          setDiag({ step: "redirect", next, bootstrapOrgId: orgId });
          return;
        }

        // 3) token_hash + type (nuevo flujo de magic link)
        if (token_hash && type) {
          setDiag({ step: "verify_otp", next, hasTokenHash: true, otpType: type });

          const { data, error: vErr } = await supabase.auth.verifyOtp({
            type: type as any,
            token_hash,
          });
          if (vErr) throw vErr;

          const at = data?.session?.access_token || "";
          if (!at) {
            // fallback: quizá sesión ya quedó guardada por persistSession
            const { data: s } = await supabase.auth.getSession();
            const at2 = s?.session?.access_token || "";
            if (!at2) throw new Error("verifyotp_no_access_token");
            setDiag({ step: "bootstrap_rpc", next, hasAccessToken: true });
            const orgId2 = await bootstrapAndRedirect(next, at2);
            setDiag({ step: "redirect", next, bootstrapOrgId: orgId2 });
            return;
          }

          setDiag({ step: "bootstrap_rpc", next, hasAccessToken: true });
          const orgId = await bootstrapAndRedirect(next, at);
          setDiag({ step: "redirect", next, bootstrapOrgId: orgId });
          return;
        }

        // 4) Último fallback: ya hay sesión (por detectSessionInUrl/persistSession)
        setDiag({ step: "fallback_getSession", next });
        const { data: sessData } = await supabase.auth.getSession();
        const at = sessData?.session?.access_token || "";
        if (at) {
          setDiag({ step: "bootstrap_rpc", next, hasAccessToken: true });
          const orgId = await bootstrapAndRedirect(next, at);
          setDiag({ step: "redirect", next, bootstrapOrgId: orgId });
          return;
        }

        // Nada funcionó
        const target = `/login?next=${encodeURIComponent(next)}&err=${encodeURIComponent("missing_access_token")}`;
        window.location.replace(target);
      } catch (e: any) {
        const msg = String(e?.message || e || "callback_error");
        setDiag({ step: "fatal", next, error: msg });
        const target = `/login?next=${encodeURIComponent(next)}&err=${encodeURIComponent(msg)}`;
        window.location.replace(target);
      }
    })();
=======
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
>>>>>>> preview
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
<<<<<<< HEAD
            <div>hasCode: {String(diag.hasCode ?? "-")}</div>
            <div>hasTokenHash: {String(diag.hasTokenHash ?? "-")}</div>
            <div>otpType: {diag.otpType || "-"}</div>
            <div>bootstrapOrgId: {diag.bootstrapOrgId || "-"}</div>
=======
            <div>bootstrapOk: {String(diag.bootstrapOk ?? "-")}</div>
>>>>>>> preview
            <div>error: {diag.error || "-"}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
