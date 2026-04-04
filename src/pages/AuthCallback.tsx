// src/pages/AuthCallback.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { supabaseTracker } from "../lib/supabaseTrackerClient";

function getQueryParam(search: string, key: string) {
  const v = new URLSearchParams(search).get(key);
  return v ?? "";
}

function safeNextPath(next: string) {
  if (!next) return "/inicio";
  if (next.startsWith("/")) return next;
  return "/inicio";
}

function parseHashParams(hash: string) {
  const h = String(hash || "").replace(/^#/, "");
  const sp = new URLSearchParams(h);
  const out: Record<string, string> = {};
  sp.forEach((v, k) => {
    out[k] = v;
  });
  return out;
}

async function bootstrapCookie(
  accessToken: string,
  refreshToken: string,
  expiresIn?: number
) {
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

  if (
    low.includes("email link is invalid") ||
    low.includes("has expired") ||
    low.includes("invalid or has expired") ||
    low.includes("otp_expired") ||
    low.includes("token has expired")
  ) {
    return {
      title: "El enlace de acceso ya no es válido",
      detail:
        "Esto pasa si el enlace expiró o si fue abierto o escaneado antes, por ejemplo por una previsualización del correo o si se abrió dos veces.",
      tips: [
        "Usa el correo más reciente y ábrelo solo una vez.",
        "Evita abrirlo dentro de un navegador interno del correo. Si puedes, usa Abrir en Chrome.",
        "Si vuelve a fallar, pide al Owner que reenvíe la invitación.",
      ],
    };
  }

  if (
    low.includes("no se pudo establecer sesión") ||
    low.includes("could not establish session")
  ) {
    return {
      title: "No se pudo completar el login",
      detail:
        "No se pudo establecer la sesión desde el callback. Esto suele ocurrir si el enlace fue consumido, expiró o fue procesado con el cliente incorrecto.",
      tips: [
        "Reintenta con un enlace nuevo.",
        "Abre el enlace en el mismo dispositivo donde lo recibiste.",
      ],
    };
  }

  return {
    title: "No se pudo completar el login",
    detail: msg,
    tips: [] as string[],
  };
}

function normalizeOtpType(t: string) {
  const v = String(t || "").toLowerCase().trim();
  if (!v) return "magiclink";
  if (v === "magiclink" || v === "invite" || v === "recovery" || v === "email") return v;
  return "magiclink";
}

function isTrackerNextPath(next: string) {
  const value = String(next || "").trim().toLowerCase();
  return value.includes("/tracker-gps");
}

async function waitForSession(authClient: typeof supabase | typeof supabaseTracker) {
  let session = null;
  for (let i = 0; i < 20; i++) {
    const { data } = await authClient.auth.getSession();
    session = data?.session ?? null;
    if (session?.access_token && session?.refresh_token) return session;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return session;
}

export default function AuthCallback() {
  const location = useLocation();
  const [status, setStatus] = useState<string>("Procesando autenticación…");
  const [error, setError] = useState<string | null>(null);
  const [errorMeta, setErrorMeta] = useState<{
    title: string;
    detail: string;
    tips: string[];
  } | null>(null);

  const next = useMemo(() => {
    const n = getQueryParam(location.search, "next");
    return safeNextPath(n || "/inicio");
  }, [location.search]);

  const isTrackerFlow = useMemo(() => isTrackerNextPath(next), [next]);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setError(null);
        setErrorMeta(null);

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

        const authClient = isTrackerFlow ? supabaseTracker : supabase;

        if (isTrackerFlow && !authClient) {
          throw new Error("Tracker auth client not available for tracker callback flow.");
        }

        const token_hash = getQueryParam(location.search, "token_hash");
        const type = normalizeOtpType(getQueryParam(location.search, "type"));

        if (token_hash) {
          setStatus("Confirmando sesión…");
          const { error: vErr } = await authClient.auth.verifyOtp({
            type: type as any,
            token_hash,
          });
          if (vErr) throw vErr;
        } else {
          const code = getQueryParam(location.search, "code");

          if (code) {
            setStatus("Intercambiando código…");
            const { error: exErr } = await authClient.auth.exchangeCodeForSession(code);
            if (exErr) throw exErr;
          } else {
            const access_token = hp.access_token || "";
            const refresh_token = hp.refresh_token || "";

            if (access_token && refresh_token) {
              setStatus("Restaurando sesión…");
              const { error: ssErr } = await authClient.auth.setSession({
                access_token,
                refresh_token,
              });
              if (ssErr) throw ssErr;
            }
          }
        }

        const session = await waitForSession(authClient);

        if (!session?.access_token || !session?.refresh_token) {
          throw new Error("No se pudo establecer sesión desde el callback.");
        }

        if (isTrackerFlow) {
          try {
            sessionStorage.setItem("tracker_auth_callback_ok", "1");
            sessionStorage.setItem("tracker_auth_callback_next", next);
            sessionStorage.setItem("tracker_active", "1");
          } catch {}
        } else {
          setStatus("Creando cookies seguras…");
          await bootstrapCookie(
            session.access_token,
            session.refresh_token,
            typeof session.expires_in === "number" ? session.expires_in : undefined
          );
        }

        if (!alive) return;

        setStatus("Redirigiendo…");

        try {
          const cleanUrl = `${window.location.pathname}${window.location.search}`;
          window.history.replaceState({}, document.title, cleanUrl);
        } catch {}

        window.location.replace(next);
      } catch (e: any) {
        if (!alive) return;

        const raw = e?.message || String(e);
        const meta = normalizeAuthErrorMessage(raw);

        console.error("[AUTH CALLBACK] failed:", raw);
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
        <div className="mt-2 text-sm opacity-80 whitespace-pre-line">{status}</div>

        <div className="mt-4 text-xs opacity-60 break-all">
          trackerFlow: {String(isTrackerFlow)}
        </div>
        <div className="mt-1 text-xs opacity-60 break-all">next: {next}</div>

        {errorMeta && (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm">
            <div className="font-semibold">{errorMeta.title}</div>
            <div className="mt-2 opacity-90">{errorMeta.detail}</div>

            {errorMeta.tips?.length ? (
              <ul className="mt-3 list-disc pl-5 opacity-90 space-y-1">
                {errorMeta.tips.map((tip) => (
                  <li key={tip}>{tip}</li>
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
            <div className="mt-2 opacity-80">
              Intenta abrir de nuevo el link o vuelve a Login.
            </div>
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
      </div>
    </div>
  );
}
