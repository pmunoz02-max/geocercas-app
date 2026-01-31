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
  } catch {
    // ignore
  }
}

function parseParamsBoth() {
  const search = window.location.search || "";
  const hashRaw = window.location.hash || "";
  const hash = hashRaw.replace(/^#/, "");
  const combined = [search.replace(/^\?/, ""), hash].filter(Boolean).join("&");
  return {
    search,
    hash: hashRaw,
    combined,
    params: new URLSearchParams(combined),
  };
}

function normalizeType(
  raw: string | null
): "magiclink" | "recovery" | "signup" | "invite" | null {
  if (!raw) return null;
  const v = raw.toLowerCase();
  if (v === "magiclink" || v === "recovery" || v === "signup" || v === "invite")
    return v as any;
  return null;
}

function hasInviteTokensInHash(): boolean {
  const h = (window.location.hash || "").toLowerCase();
  return h.includes("access_token=") || h.includes("refresh_token=");
}

export default function AuthCallback() {
  const navigate = useNavigate();

  const parsed = useMemo(() => parseParamsBoth(), []);
  const [step, setStep] = useState("init");
  const [err, setErr] = useState<string | null>(null);
  const [sessionExists, setSessionExists] = useState(false);
  const [sbKeys, setSbKeys] = useState<string[]>([]);
  const [orgId, setOrgId] = useState<string | null>(null);

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

        // ---- detectar flow tracker ----
        const next = parsed.params.get("next") || "";
        const tg_flow =
          parsed.params.get("tg_flow") ||
          (next.includes("tg_flow=tracker") ? "tracker" : "");
        const force =
          parsed.params.get("force") ||
          (next.includes("force=1") ? "1" : "0");

        const isTrackerFlow = String(tg_flow).toLowerCase() === "tracker";
        const forceSwap = force === "1" || isTrackerFlow;

        const code = parsed.params.get("code");
        const token_hash = parsed.params.get("token_hash");
        const type = normalizeType(parsed.params.get("type"));

        setStep(
          `params_detected: code=${code ? "YES" : "NO"} token_hash=${
            token_hash ? "YES" : "NO"
          } type=${type || "null"} trackerFlow=${
            isTrackerFlow ? "YES" : "NO"
          } forceSwap=${forceSwap ? "YES" : "NO"} hashTokens=${
            hasInviteTokensInHash() ? "YES" : "NO"
          }`
        );

        // ✅ 0) Forzar swap de sesión SI es tracker flow
        if (forceSwap) {
          setStep("force_swap:signOut+clearStorage");
          try {
            await supabase.auth.signOut();
          } catch {
            // ignore
          }
          clearSbTokensBestEffort();
          // pequeña pausa para evitar race con storage
          await sleep(200);
        }

        // ✅ 1) Consumir sesión desde URL (invite links vienen con tokens en hash)
        setStep("getSessionFromUrl...");
        try {
          await supabase.auth.getSessionFromUrl({ storeSession: true });
        } catch {
          // no bloquea; seguimos con code/token_hash si existen
        }

        // ✅ 2) Fallbacks para otros tipos de callback
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
          const { error } = await supabase.auth.verifyOtp({
            token_hash,
            type: type as any,
          });
          if (error) {
            setErr(error.message || "verifyOtp_error");
            setStep("verify_failed");
            return;
          }
        } else {
          // si era invite link, debería haberse consumido ya; si no, error
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

        // ✅ 4) Redirect por next (si viene)
        if (next) {
          setStep("redirect_next");
          navigate(next, { replace: true });
          return;
        }

        // ✅ 5) Contexto org (si falla => tracker)
        setStep("rpc_get_my_context (optional)");
        try {
          const { data: ctx, error: ctxErr } = await supabase.rpc("get_my_context");
          if (ctxErr) {
            setStep("get_my_context_failed_continue_tracker");
            navigate(`/tracker-gps?tg_flow=tracker`, { replace: true });
            return;
          }

          const oid = ctx?.org_id ? String(ctx.org_id) : null;
          setOrgId(oid);

          if (oid) {
            try {
              localStorage.setItem(LAST_ORG_KEY, oid);
            } catch {}
            setStep("redirect_inicio");
            navigate(`/inicio`, { replace: true });
            return;
          }

          setStep("no_org_assume_tracker");
          navigate(`/tracker-gps?tg_flow=tracker`, { replace: true });
          return;
        } catch {
          setStep("rpc_exception_continue_tracker");
          navigate(`/tracker-gps?tg_flow=tracker`, { replace: true });
          return;
        }
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
        <div><b>step:</b> {step}</div>
        <div><b>sessionExists:</b> {String(sessionExists)}</div>
        <div><b>sbKeys:</b> {sbKeys.length ? sbKeys.join(", ") : "[]"}</div>
        <div><b>orgId:</b> {orgId || "—"}</div>
        {err && <div style={{ color: "#b00020", marginTop: 8 }}><b>error:</b> {err}</div>}
      </div>

      <div style={{ marginTop: 12 }}>
        <div><b>location.href</b></div>
        <pre style={{ whiteSpace: "pre-wrap", background: "#111", color: "#0f0", padding: 12, borderRadius: 8 }}>
{String(window.location.href)}
        </pre>
      </div>
    </div>
  );
}
