import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

const LAST_ORG_KEY = "app_geocercas_last_org_id";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
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

function isSafeNextPath(next: string) {
  return typeof next === "string" && next.startsWith("/");
}

export default function AuthCallback() {
  const navigate = useNavigate();
  const parsed = useMemo(() => parseParamsBoth(), []);
  const [step, setStep] = useState("init");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      try {
        setStep("consume_invite_or_magiclink");

        // ✅ 1) CANÓNICO: consumir sesión desde URL (INVITE LINKS)
        await supabase.auth.getSessionFromUrl({ storeSession: true });

        // pequeña espera para que el storage se estabilice
        await sleep(150);

        // ✅ 2) Confirmar que hay sesión
        const start = Date.now();
        let ok = false;

        while (Date.now() - start < 8000) {
          const { data } = await supabase.auth.getSession();
          if (data?.session) {
            ok = true;
            break;
          }
          await sleep(200);
        }

        if (!ok) {
          setErr("session_not_created_from_invite_or_magiclink");
          setStep("session_missing");
          return;
        }

        // ✅ 3) Redirect explícito si viene next
        const nextRaw = parsed.params.get("next");
        if (nextRaw && isSafeNextPath(nextRaw)) {
          setStep("redirect_next");
          navigate(nextRaw, { replace: true });
          return;
        }

        // ✅ 4) Intentar contexto (no bloqueante)
        setStep("rpc_get_my_context");
        try {
          const { data: ctx } = await supabase.rpc("get_my_context");
          const oid = ctx?.org_id ? String(ctx.org_id) : null;

          if (oid) {
            try {
              localStorage.setItem(LAST_ORG_KEY, oid);
            } catch {}
            navigate("/inicio", { replace: true });
            return;
          }
        } catch {
          // ignore
        }

        // ✅ 5) Fallback: tracker
        setStep("redirect_tracker");
        navigate("/tracker-gps?tg_flow=tracker", { replace: true });
      } catch (e: any) {
        setErr(e?.message || "auth_callback_exception");
        setStep("exception");
      }
    };

    run();
  }, [parsed, navigate]);

  // Debug mínimo (puedes quitar luego)
  return (
    <div style={{ minHeight: "100vh", padding: 16, fontFamily: "sans-serif" }}>
      <h2>AuthCallback</h2>
      <div><b>step:</b> {step}</div>
      {err && <div style={{ color: "crimson" }}>{err}</div>}
      <pre>{window.location.href}</pre>
    </div>
  );
}
