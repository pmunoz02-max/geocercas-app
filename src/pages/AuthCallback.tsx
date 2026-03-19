// src/pages/AuthCallback.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { supabaseTracker } from "../lib/supabaseTrackerClient";
import { isTrackerCallbackNext } from "../lib/trackerFlow";

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

function normalizeAuthErrorMessage(raw: string) {
  const msg = String(raw || "").trim();
  const low = msg.toLowerCase();

  // Caso t├¡pico: link consumido por ÔÇ£link scanningÔÇØ, abierto 2 veces, o expir├│.
  if (
    low.includes("email link is invalid") ||
    low.includes("has expired") ||
    low.includes("invalid or has expired") ||
    low.includes("otp_expired") ||
    low.includes("token has expired")
  ) {
    return {
      title: "El enlace de acceso ya no es v├ílido",
      detail:
        "Esto pasa si el enlace expir├│ o si fue abierto/escaneado antes (por ejemplo, previsualizaci├│n del correo, SafeLinks de Outlook, o abrirlo dos veces).",
      tips: [
        "Usa el correo m├ís reciente (├║ltima invitaci├│n) y ├íbrelo solo una vez.",
        "Evita abrirlo dentro de un navegador interno (in-app browser). Si puedes, elige ÔÇ£Abrir en Chrome/SafariÔÇØ.",
        "Si vuelve a fallar, pide al Owner que reenv├¡e la invitaci├│n.",
      ],
    };
  }

  // Errores comunes de callback/session
  if (low.includes("no se pudo establecer sesi├│n") || low.includes("could not establish session")) {
    return {
      title: "No se pudo completar el login.",
      detail:
        "No se pudo establecer la sesi├│n desde el callback. Esto suele ocurrir si el callback no procesa el tipo de enlace recibido o si el enlace fue consumido/expir├│.",
      tips: [
        "Reintenta con un enlace nuevo (magic link m├ís reciente).",
        "Aseg├║rate de abrir el enlace en el mismo dispositivo/navegador donde lo solicitaste.",
      ],
    };
  }

  return { title: "No se pudo completar el login.", detail: msg, tips: [] as string[] };
}

/**
 * Tipos v├ílidos para verifyOtp:
 * - "magiclink" (caso actual)
 * - "invite"
 * - "recovery"
 * - "email" (dependiendo de flujo)
 *
 * Nota: Supabase env├¡a `type=magiclink` en tu caso.
 */
function normalizeOtpType(t: string) {
  const v = String(t || "").toLowerCase().trim();
  if (!v) return "magiclink";
  if (v === "magiclink" || v === "invite" || v === "recovery" || v === "email") return v;
  // fallback seguro
  return "magiclink";
}

export default function AuthCallback() {
  const location = useLocation();
  const [status, setStatus] = useState<string>("Procesando autenticaci├│nÔÇª");
  const [error, setError] = useState<string | null>(null);
  const [errorMeta, setErrorMeta] = useState<{ title: string; detail: string; tips: string[] } | null>(
    null
  );

  const next = useMemo(() => {
    const n = getQueryParam(location.search, "next");
    return safeNextPath(n || "/inicio");
  }, [location.search]);

  const isTrackerFlow = useMemo(() => isTrackerCallbackNext(next), [next]);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setError(null);
        setErrorMeta(null);

        // 0) Errores en hash o query
        const hash = typeof window !== "undefined" ? window.location.hash : "";
        const hp = parseHashParams(hash);

        const queryErr = getQueryParam(location.search, "error");
        const queryDesc = getQueryParam(location.search, "error_description");

        if (hp.error || queryErr) {
          const e = hp.error || queryErr;
          const d = hp.error_description
            ? decodeURIComponent(hp.error_description)
            : queryDesc
            ? decodeURIComponent(queryDesc)
            : "";
          const msg = d ? `${e}: ${d}` : String(e);
          throw new Error(msg);
        }

        // 1) Ô£à PKCE magiclink / invite / recovery v├¡a query: token_hash + type
        // Ejemplo: /auth/callback?next=...&token_hash=pkce_xxx&type=magiclink
        const token_hash = getQueryParam(location.search, "token_hash");
        const type = normalizeOtpType(getQueryParam(location.search, "type"));

        const authClient = isTrackerFlow ? supabaseTracker : supabase;
        if (isTrackerFlow && !authClient) {
          throw new Error("Tracker auth client not available for tracker callback flow.");
        }

        if (token_hash) {
          setStatus("Confirmando sesi├│n (token_hash)ÔÇª");
          const { error: vErr } = await authClient.auth.verifyOtp({
            type: type as any,
            token_hash,
          });
          if (vErr) throw vErr;
        } else {
          // 2) PKCE: ?code=...
          const code = getQueryParam(location.search, "code");
          if (code) {
            setStatus("Confirmando sesi├│n (code)ÔÇª");
            const { error: exErr } = await authClient.auth.exchangeCodeForSession(code);
            if (exErr) throw exErr;
          } else {
            // 3) Implicit: #access_token=...&refresh_token=...
            const access_token = hp.access_token || "";
            const refresh_token = hp.refresh_token || "";

            if (access_token && refresh_token) {
              setStatus("Confirmando sesi├│n (token)ÔÇª");
              const { error: ssErr } = await authClient.auth.setSession({
                access_token,
                refresh_token,
              });
              if (ssErr) throw ssErr;
            } else {
              // 4) Si no vino nada, intentamos getSession por si ya est├í hidratada
              setStatus("Confirmando sesi├│nÔÇª");
            }
          }
        }

        // 5) Obtener sesi├│n desde el cliente
        const { data } = await authClient.auth.getSession();
        const session = data?.session;

        if (!session?.access_token || !session?.refresh_token) {
          throw new Error("No se pudo establecer sesi├│n desde el callback.");
        }

        // 6) Bootstrap cookies (tg_at/tg_rt)
        if (!isTrackerFlow) {
          setStatus("Creando cookies segurasÔÇª");
          await bootstrapCookie(
            session.access_token,
            session.refresh_token,
            typeof session.expires_in === "number" ? session.expires_in : undefined
          );
        }

        // 7) Redirigir al panel (hard redirect)
        setStatus("EntrandoÔÇª");
        if (!alive) return;
        window.location.assign(next);
      } catch (e: any) {
        if (!alive) return;

        const raw = e?.message || String(e);
        const meta = normalizeAuthErrorMessage(raw);

        setError(raw);
        setErrorMeta(meta);
        setStatus(meta.title || "No se pudo completar el login.");
      }
    })();

    return () => {
      alive = false;
    };
  }, [isTrackerFlow, location.search, next]);

  const onGoLogin = () => {
    window.location.assign(`/login?next=${encodeURIComponent(next)}`);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-200 p-6">
      <div className="max-w-md w-full rounded-2xl border border-white/10 bg-white/[0.04] p-5">
        <div className="text-lg font-semibold">Auth Callback</div>
        <div className="mt-2 text-sm opacity-80">{status}</div>

        {errorMeta && (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm">
            <div className="font-semibold">{errorMeta.title}</div>
            <div className="mt-2 opacity-90">{errorMeta.detail}</div>

            {errorMeta.tips?.length ? (
              <ul className="mt-3 list-disc pl-5 opacity-90 space-y-1">
                {errorMeta.tips.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            ) : null}

            <div className="mt-4 flex gap-2">
              <button
                onClick={onGoLogin}
                className="rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 px-3 py-2 text-sm"
              >
                Volver a Login
              </button>
              <button
                onClick={() => window.location.reload()}
                className="rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 px-3 py-2 text-sm"
              >
                Reintentar
              </button>
            </div>
          </div>
        )}

        {!errorMeta && error && (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm">
            {error}
            <div className="mt-2 opacity-80">Intenta abrir de nuevo el link o vuelve a Login.</div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={onGoLogin}
                className="rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 px-3 py-2 text-sm"
              >
                Volver a Login
              </button>
            </div>
          </div>
        )}

        <div className="mt-4 text-xs opacity-60 break-all">next: {next}</div>
      </div>
    </div>
  );
}
