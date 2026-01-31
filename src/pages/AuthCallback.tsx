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

function clearSbTokens() {
  try {
    const keys = getSbTokenKeys();
    for (const k of keys) {
      try {
        window.localStorage.removeItem(k);
      } catch {
        // ignore
      }
    }
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

function normalizeType(raw: string | null):
  | "magiclink"
  | "recovery"
  | "signup"
  | "invite"
  | null {
  if (!raw) return null;
  const v = raw.toLowerCase();
  if (v === "magiclink" || v === "recovery" || v === "signup" || v === "invite") return v as any;
  return null;
}

function isSafeNextPath(next: string) {
  // Solo permitimos rutas internas tipo "/tracker-gps?..."
  // Evita open-redirects.
  return typeof next === "string" && next.startsWith("/");
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

        const code = parsed.params.get("code");
        const token_hash = parsed.params.get("token_hash");
        const type = normalizeType(parsed.params.get("type"));

        setStep(
          `params_detected: code=${code ? "YES" : "NO"} token_hash=${token_hash ? "YES" : "NO"} type=${
            type || "null"
          }`
        );

        // ✅ 0) IMPORTANTE: si hay una sesión previa (admin), hay que forzar swap.
        setStep("precheck_existing_session");
        const pre = await supabase.auth.getSession();
        const hadSession = !!pre?.data?.session;

        setSessionExists(hadSession);
        setSbKeys(getSbTokenKeys());

        if (hadSession) {
          setStep("signOut_existing_session_for_swap");
          try {
            // scope local para no afectar otros dispositivos
            await supabase.auth.signOut({ scope: "local" });
          } catch {
            // ignore
          }

          // Limpiamos tokens locales para evitar que se quede pegado a la sesión anterior
          clearSbTokens();

          // Espera breve para que storage quede estable
          await sleep(150);
        }

        // ✅ 1) Consumir callback (code o token_hash)
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

        // ✅ 2) Esperar sesión nueva (confirmar que existe)
        setStep("waiting_session...");
        const start = Date.now();
        let ok = false;

        while (Date.now() - start < 9000) {
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

        // ✅ 3) Si viene next=... lo respetamos (y SOLO si es ruta interna)
        const nextRaw = parsed.params.get("next");
        const next = nextRaw ? String(nextRaw) : null;

        if (next && isSafeNextPath(next)) {
          setStep("redirect_next");
          navigate(next, { replace: true });
          return;
        }

        // ✅ 4) Intentar contexto (si falla NO bloquea al tracker)
        setStep("rpc_get_my_context (optional) ...");
        try {
          const { data: ctx, error: ctxErr } = await supabase.rpc("get_my_context");
          if (ctxErr) {
            setStep("get_my_context_failed_but_continue_tracker");
            navigate(`/tracker-gps?tg_flow=tracker`, { replace: true });
            return;
          }

          const oid = ctx?.org_id ? String(ctx.org_id) : null;
          setOrgId(oid);

          if (oid) {
            try {
              localStorage.setItem(LAST_ORG_KEY, oid);
            } catch {
              // ignore
            }
            setStep("redirect_inicio");
            navigate(`/inicio`, { replace: true });
            return;
          }

          // sin org_id => tracker
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
