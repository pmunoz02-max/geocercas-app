// src/pages/AuthCallback.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

function getQueryParam(search: string, key: string) {
  const v = new URLSearchParams(search).get(key);
  return v ?? "";
}

function safeNextPath(next: string) {
  if (!next) return "/inicio";
  // SOLO paths relativos (seguro)
  if (next.startsWith("/")) return next;
  return "/inicio";
}

function parseHashParams(hash: string) {
  const h = String(hash || "").replace(/^#/, "");
  const sp = new URLSearchParams(h);
  const out: Record<string, string> = {};
  sp.forEach((v, k) => (out[k] = v));
  return out;
}

async function bootstrapCookie(accessToken: string, refreshToken: string, expiresIn?: number) {
  const res = await fetch("/api/auth/bootstrap", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({
      refresh_token: refreshToken,
      expires_in: typeof expiresIn === "number" ? expiresIn : undefined,
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Bootstrap failed (HTTP ${res.status}). ${txt || ""}`.trim());
  }
}

export default function AuthCallback() {
  const location = useLocation();
  const [status, setStatus] = useState<string>("Procesando autenticación…");
  const [error, setError] = useState<string | null>(null);

  const next = useMemo(() => {
    const n = getQueryParam(location.search, "next");
    return safeNextPath(n || "/inicio");
  }, [location.search]);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setError(null);

        // 0) Si Supabase devolvió error en hash: #error=access_denied&error_description=...
        const hash = typeof window !== "undefined" ? window.location.hash : "";
        const hp = parseHashParams(hash);

        if (hp.error) {
          const desc = hp.error_description ? decodeURIComponent(hp.error_description) : "";
          throw new Error(desc ? `${hp.error}: ${desc}` : String(hp.error));
        }

        // 1) PKCE: ?code=...
        const code = getQueryParam(location.search, "code");
        if (code) {
          setStatus("Confirmando sesión (code)…");
          const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);
          if (exErr) throw exErr;
        } else {
          // 2) Implicit: #access_token=...&refresh_token=...
          const access_token = hp.access_token || "";
          const refresh_token = hp.refresh_token || "";

          if (access_token && refresh_token) {
            setStatus("Confirmando sesión (token)…");
            const { error: ssErr } = await supabase.auth.setSession({
              access_token,
              refresh_token,
            });
            if (ssErr) throw ssErr;
          } else {
            // 3) Si no vino code ni tokens, igual intentamos getSession por si ya está hidratada
            setStatus("Confirmando sesión…");
          }
        }

        // 4) Obtener sesión desde el cliente
        const { data } = await supabase.auth.getSession();
        const session = data?.session;

        if (!session?.access_token || !session?.refresh_token) {
          throw new Error("No session established from callback URL.");
        }

        // 5) Bootstrap cookies (tg_at/tg_rt)
        setStatus("Creando cookies seguras…");
        await bootstrapCookie(
          session.access_token,
          session.refresh_token,
          typeof session.expires_in === "number" ? session.expires_in : undefined
        );

        // 6) Redirigir al panel (hard redirect)
        setStatus("Entrando…");
        if (!alive) return;
        window.location.assign(next);
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message || String(e));
        setStatus("No se pudo completar el login.");
      }
    })();

    return () => {
      alive = false;
    };
  }, [location.search, next]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-200 p-6">
      <div className="max-w-md w-full rounded-2xl border border-white/10 bg-white/[0.04] p-5">
        <div className="text-lg font-semibold">Auth Callback</div>
        <div className="mt-2 text-sm opacity-80">{status}</div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm">
            {error}
            <div className="mt-2 opacity-80">
              Intenta abrir de nuevo el link o vuelve a Login.
            </div>
          </div>
        )}

        <div className="mt-4 text-xs opacity-60 break-all">next: {next}</div>
      </div>
    </div>
  );
}
