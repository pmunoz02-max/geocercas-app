// src/pages/AuthCallback.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

const LAST_ORG_KEY = "app_geocercas_last_org_id";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function getSbTokenKeys(): string[] {
  try {
    return Object.keys(window.localStorage || {}).filter((k) =>
      /^sb-.*-auth-token$/i.test(String(k))
    );
  } catch {
    return [];
  }
}

function clearSbTokensBestEffort() {
  try {
    const keys = getSbTokenKeys();
    for (const k of keys) window.localStorage.removeItem(k);
  } catch {}
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

export default function AuthCallback() {
  const navigate = useNavigate();
  const parsed = useMemo(() => parseParamsBoth(), []);
  const [step, setStep] = useState("init");
  const [err, setErr] = useState<string | null>(null);
  const [sessionExists, setSessionExists] = useState(false);
  const [sbKeys, setSbKeys] = useState<string[]>([]);

  useEffect(() => {
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

        // forzar swap siempre en tracker flow
        const forceSwap = isTrackerFlow;

        const code = parsed.params.get("code");
        const token_hash = parsed.params.get("token_hash");
        const type = normalizeType(parsed.params.get("type"));

        setStep(
          `params_detected: code=${code ? "YES" : "NO"} token_hash=${token_hash ? "YES" : "NO"} type=${
            type || "null"
          } trackerFlow=${isTrackerFlow ? "YES" : "NO"} forceSwap=${forceSwap ? "YES" : "NO"} next=${
            nextPath ? "YES" : "NO"
          } org_id=${orgId ? "YES" : "NO"} hashTokens=${hasInviteTokensInHash() ? "YES" : "NO"}`
        );

        // ✅ 0) Tracker flow: cerrar sesión y limpiar tokens para no heredar rol/org anterior
        if (forceSwap) {
          setStep("force_swap:signOut+clearStorage");
          try {
            await supabase.auth.signOut();
          } catch {}
          clearSbTokensBestEffort();
          await sleep(200);
        }

        // ✅ 1) Consumir sesión desde URL
        setStep("getSessionFromUrl...");
        try {
          await supabase.auth.getSessionFromUrl({ storeSession: true });
        } catch {}

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
          setSbKeys(getSbTokenKeys());
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

        // ✅ 4) Tracker flow: fijar org invitada como org activa (clave para multi-org)
        if (isTrackerFlow && orgId) {
          setStep("tracker_flow:set_last_org");
          try {
            localStorage.setItem(LAST_ORG_KEY, orgId);
          } catch {}
        }

        // ✅ 5) Redirect a next si viene (preferido)
        if (nextPath) {
          setStep("redirect_next");
          navigate(nextPath, { replace: true });
          return;
        }

        // ✅ 6) Sin next: tracker a tracker-gps, otros a inicio
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

  return (
    <div style={{ minHeight: "100vh", padding: 16, fontFamily: "sans-serif" }}>
      <h2>AuthCallback Debug</h2>

      <div style={{ marginTop: 8, padding: 12, background: "#f5f5f5", borderRadius: 8 }}>
        <div>
          <b>step:</b> {step}
        </div>
        <div>
          <b>sessionExists:</b> {String(sessionExists)}
        </div>
        <div>
          <b>sbKeys:</b> {sbKeys.length ? sbKeys.join(", ") : "[]"}
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
        <pre style={{ whiteSpace: "pre-wrap", background: "#111", color: "#0f0", padding: 12, borderRadius: 8 }}>
          {String(window.location.href)}
        </pre>
      </div>
    </div>
  );
}
