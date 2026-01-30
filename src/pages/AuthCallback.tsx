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

function parseParamsBoth() {
  const search = window.location.search || "";
  const hash = (window.location.hash || "").replace(/^#/, "");
  const combined = [search.replace(/^\?/, ""), hash].filter(Boolean).join("&");
  return {
    search,
    hash: window.location.hash || "",
    combined,
    params: new URLSearchParams(combined),
  };
}

function normalizeType(raw: string | null): "magiclink" | "recovery" | "signup" | "invite" | null {
  if (!raw) return null;
  const v = raw.toLowerCase();
  if (v === "magiclink" || v === "recovery" || v === "signup" || v === "invite") return v as any;
  return null;
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

        // 0) Mostrar si Supabase manda error por URL
        const urlErr =
          parsed.params.get("error_description") ||
          parsed.params.get("error") ||
          parsed.params.get("message");

        if (urlErr) {
          setErr(String(urlErr));
          setStep("url_error");
          return;
        }

        // 1) Detectar parámetros reales
        const code = parsed.params.get("code");
        const token_hash = parsed.params.get("token_hash");
        const type = normalizeType(parsed.params.get("type"));

        setStep(
          `params_detected: code=${code ? "YES" : "NO"} token_hash=${token_hash ? "YES" : "NO"} type=${
            type || "null"
          }`
        );

        // 2) Ejecutar el intercambio correcto
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
          setErr("missing_code_or_token_hash_in_callback_url");
          setStep("missing_params");
          return;
        }

        // 3) Esperar sesión
        setStep("waiting_session...");
        const start = Date.now();
        let ok = false;
        while (Date.now() - start < 7000) {
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
          setErr("session_not_created_after_exchange_or_verify");
          setStep("session_missing");
          return;
        }

        // 4) Resolver org_id (si ya hay sesión)
        setStep("rpc_get_my_context...");
        const { data: ctx, error: ctxErr } = await supabase.rpc("get_my_context");
        if (ctxErr) {
          setErr(ctxErr.message || "get_my_context_error");
          setStep("rpc_failed");
          return;
        }

        const oid = ctx?.org_id ? String(ctx.org_id) : null;
        setOrgId(oid);

        if (!oid) {
          setErr("org_id_not_resolved");
          setStep("org_missing");
          return;
        }

        try {
          localStorage.setItem(LAST_ORG_KEY, oid);
        } catch {
          // ignore
        }

        setStep("ready_to_continue");
      } catch (e: any) {
        setErr(e?.message || "auth_callback_exception");
        setStep("exception");
      }
    };

    run();
  }, [parsed]);

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

        <div><b>location.search</b></div>
        <pre style={{ whiteSpace: "pre-wrap", background: "#111", color: "#0f0", padding: 12, borderRadius: 8 }}>
{parsed.search}
        </pre>

        <div><b>location.hash</b></div>
        <pre style={{ whiteSpace: "pre-wrap", background: "#111", color: "#0f0", padding: 12, borderRadius: 8 }}>
{parsed.hash}
        </pre>

        <div><b>parsed param keys</b></div>
        <pre style={{ whiteSpace: "pre-wrap", background: "#111", color: "#0f0", padding: 12, borderRadius: 8 }}>
{Array.from(parsed.params.keys()).join(", ")}
        </pre>
      </div>

      <button
        style={{
          marginTop: 16,
          padding: "12px 16px",
          borderRadius: 8,
          border: "none",
          background: "#0f172a",
          color: "white",
          cursor: "pointer",
          opacity: step === "ready_to_continue" ? 1 : 0.5,
        }}
        disabled={step !== "ready_to_continue"}
        onClick={() => {
          if (!orgId) return;
          navigate(`/tracker-gps?tg_flow=tracker&org_id=${encodeURIComponent(orgId)}`, { replace: true });
        }}
      >
        Continuar a Tracker GPS
      </button>
    </div>
  );
}
