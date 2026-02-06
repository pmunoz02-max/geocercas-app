// src/pages/AuthCallback.tsx
<<<<<<< HEAD
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

const LAST_ORG_KEY = "app_geocercas_last_org_id";
=======
// CALLBACK-V32 – WebView/TWA safe: NO setSession(), solo token en memoria + bootstrap RPC + redirect
import React, { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase, setMemoryAccessToken } from "../supabaseClient";

type Diag = {
  step: string;
  next?: string;
  hasAccessToken?: boolean;
  bootstrapOrgId?: string;
  error?: string;
};
>>>>>>> fix/magiclink-bootstrap

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseParamsBoth() {
  const search = window.location.search || "";
  const hashRaw = window.location.hash || "";
  const hash = hashRaw.replace(/^#/, "");
  const combined = [search.replace(/^\?/, ""), hash].filter(Boolean).join("&");
  return { search, hash: hashRaw, combined, params: new URLSearchParams(combined) };
}

function normalizeType(
  raw: string | null
): "magiclink" | "recovery" | "signup" | "invite" | null {
  if (!raw) return null;
  const v = raw.toLowerCase();
  if (v === "magiclink" || v === "recovery" || v === "signup" || v === "invite") return v as any;
  return null;
}

function hasInviteTokensInHash(): boolean {
  const h = (window.location.hash || "").toLowerCase();
  return h.includes("access_token=") || h.includes("refresh_token=");
}

function normalizeNextToPath(nextRaw: string): string {
  const next = String(nextRaw || "").trim();
  if (!next) return "";
  if (/^https?:\/\//i.test(next)) {
    try {
      const u = new URL(next);
      return `${u.pathname}${u.search}${u.hash}`;
    } catch {
      return "";
    }
  }
  if (!next.startsWith("/")) return `/${next}`;
  return next;
}

function isTrackerNext(path: string) {
  return path === "/tracker-gps" || path.startsWith("/tracker-gps?");
}

function getParamFromPath(path: string, key: string) {
  try {
    const u = new URL(path, window.location.origin);
    return (u.searchParams.get(key) || "").trim();
  } catch {
    return "";
  }
}

function safeNext(raw: string | null | undefined) {
  const n = (raw || "").trim();
  // evita open-redirect: solo paths internos
  if (!n || !n.startsWith("/")) return "/inicio";
  return n;
}

export default function AuthCallback() {
  const navigate = useNavigate();
  const parsed = useMemo(() => parseParamsBoth(), []);

  const [step, setStep] = useState("init");
  const [err, setErr] = useState<string | null>(null);
  const [sessionExists, setSessionExists] = useState(false);

  useEffect(() => {
<<<<<<< HEAD
    const run = async () => {
      try {
        setStep("reading_params");

        const urlErr =
          parsed.params.get("error_description") ||
          parsed.params.get("error") ||
          parsed.params.get("message");

        if (urlErr) {
          setErr(String(urlErr));
          setStep("url_error");
          return;
        }

        const nextRaw = parsed.params.get("next") || "";
        const nextPath = normalizeNextToPath(nextRaw);

        const tg_flow =
          (parsed.params.get("tg_flow") || "").trim() ||
          (nextPath.includes("tg_flow=tracker") ? "tracker" : "") ||
          (isTrackerNext(nextPath) ? "tracker" : "");

        const isTrackerFlow = String(tg_flow).toLowerCase() === "tracker";

        // org_id puede venir directo en callback o dentro del next
        const orgId =
          (parsed.params.get("org_id") || "").trim() ||
          getParamFromPath(nextPath, "org_id");

        const code = parsed.params.get("code");
        const token_hash = parsed.params.get("token_hash");
        const type = normalizeType(parsed.params.get("type"));

        setStep(
          `params_detected: code=${code ? "YES" : "NO"} token_hash=${token_hash ? "YES" : "NO"} type=${
            type || "null"
          } trackerFlow=${isTrackerFlow ? "YES" : "NO"} next=${nextPath ? "YES" : "NO"} org_id=${
            orgId ? "YES" : "NO"
          } hashTokens=${hasInviteTokensInHash() ? "YES" : "NO"}`
        );

        // ✅ 1) Consumir sesión desde URL (NO borrar tokens, NO signOut antes)
        setStep("getSessionFromUrl...");
        try {
          await supabase.auth.getSessionFromUrl({ storeSession: true });
        } catch {
          // seguimos con fallbacks
        }

        // ✅ 2) Fallbacks
        if (code) {
          setStep("exchangeCodeForSession...");
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            setErr(error.message || "exchange_code_error");
            setStep("exchange_failed");
            return;
          }
        } else if (token_hash && type) {
          setStep("verifyOtp...");
          const { error } = await supabase.auth.verifyOtp({ token_hash, type: type as any });
          if (error) {
            setErr(error.message || "verifyOtp_error");
            setStep("verify_failed");
            return;
          }
        } else {
          if (!hasInviteTokensInHash()) {
            setErr("missing_code_or_token_hash_in_callback_url");
            setStep("missing_params");
            return;
          }
        }

        // ✅ 3) Esperar sesión
        setStep("waiting_session...");
        const start = Date.now();
        let ok = false;

        while (Date.now() - start < 8000) {
          const { data } = await supabase.auth.getSession();
          const s = !!data?.session;
          setSessionExists(s);
          if (s) {
            ok = true;
            break;
          }
          await sleep(200);
        }

        if (!ok) {
          setErr("session_not_created_after_callback");
          setStep("session_missing");
          return;
        }

        // ✅ 4) Tracker flow: fijar org invitada como org activa (SIN tocar tokens)
        if (isTrackerFlow && orgId) {
          setStep("tracker_flow:set_last_org");
          try {
            localStorage.setItem(LAST_ORG_KEY, orgId);
          } catch {}
        }

        // ✅ 5) Limpieza de URL (opcional pero recomendado): quita hash con tokens del address bar
        // Evita re-procesos raros en navegadores y deja la URL limpia.
        try {
          if (window.location.hash) {
            window.history.replaceState(null, "", window.location.pathname + window.location.search);
          }
        } catch {}

        // ✅ 6) Redirect
        if (nextPath) {
          setStep("redirect_next");
          navigate(nextPath, { replace: true });
          return;
        }

        if (isTrackerFlow) {
          setStep("redirect_tracker_default");
          navigate("/tracker-gps?tg_flow=tracker", { replace: true });
          return;
        }

        setStep("redirect_inicio");
        navigate("/inicio", { replace: true });
      } catch (e: any) {
        setErr(e?.message || "auth_callback_exception");
        setStep("exception");
      }
    };

    run();
  }, [parsed, navigate]);
=======
    if (fired.current) return;
    fired.current = true;

    (async () => {
      try {
        setDiag({ step: "parse_url" });

        const next = safeNext(searchParams.get("next") || "/inicio");
        const { access_token, error } = parseHashParams(window.location.hash || "");

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

        // ✅ Fuente de verdad: token en memoria (NO setSession)
        setDiag({ step: "set_memory_token", next, hasAccessToken: true });
        setMemoryAccessToken(access_token);

        // ✅ Bootstrap post-login: crea/asegura org/rol owner sin triggers en auth.users
        setDiag({ step: "bootstrap_rpc", next, hasAccessToken: true });
        const { data, error: rpcError } = await supabase.rpc("bootstrap_user_after_login");

        if (rpcError) {
          // Si falla bootstrap, NO loops. Mandamos a login con error claro.
          const msg = rpcError.message || "bootstrap_failed";
          setDiag({ step: "bootstrap_failed", next, hasAccessToken: true, error: msg });
          const target = `/login?next=${encodeURIComponent(next)}&err=${encodeURIComponent(msg)}`;
          try {
            window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
          } catch {}
          window.location.replace(target);
          return;
        }

        // Limpia hash (evita repetir callback si la WebView re-renderiza)
        try {
          window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
        } catch {}

        setDiag({
          step: "redirect",
          next,
          hasAccessToken: true,
          bootstrapOrgId: data ? String(data) : undefined,
        });

        // ✅ Redirección directa (sin navigate, sin timers)
        window.location.replace(next);
      } catch (e: any) {
        const msg = String(e?.message || e || "callback_error");
        const next = safeNext(searchParams.get("next") || "/inicio");

        setDiag({ step: "fatal", next, error: msg });

        const target = `/login?next=${encodeURIComponent(next)}&err=${encodeURIComponent(msg)}`;
        try {
          window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
        } catch {}
        window.location.replace(target);
      }
    })();
  }, [searchParams]);
>>>>>>> fix/magiclink-bootstrap

  return (
    <div style={{ minHeight: "100vh", padding: 16, fontFamily: "sans-serif" }}>
      <h2>AuthCallback Debug</h2>

<<<<<<< HEAD
      <div style={{ marginTop: 8, padding: 12, background: "#f5f5f5", borderRadius: 8 }}>
        <div>
          <b>step:</b> {step}
=======
          <div className="mt-6 text-xs bg-black/30 border border-white/10 rounded-2xl p-4 space-y-1">
            <div>step: {diag.step}</div>
            <div>next: {diag.next || "-"}</div>
            <div>hasAccessToken: {String(diag.hasAccessToken ?? "-")}</div>
            <div>bootstrapOrgId: {diag.bootstrapOrgId || "-"}</div>
            <div>error: {diag.error || "-"}</div>
          </div>
>>>>>>> fix/magiclink-bootstrap
        </div>
        <div>
          <b>sessionExists:</b> {String(sessionExists)}
        </div>
        {err && (
          <div style={{ color: "#b00020", marginTop: 8 }}>
            <b>error:</b> {err}
          </div>
        )}
      </div>

      <div style={{ marginTop: 12 }}>
        <div>
          <b>location.href</b>
        </div>
        <pre
          style={{
            whiteSpace: "pre-wrap",
            background: "#111",
            color: "#0f0",
            padding: 12,
            borderRadius: 8,
          }}
        >
          {String(window.location.href)}
        </pre>
      </div>
    </div>
  );
}
