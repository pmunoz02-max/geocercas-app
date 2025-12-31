// src/pages/AuthCallback.tsx
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

type Step = "working" | "success" | "error";

function isTrackerHostname(hostname: string) {
  const h = String(hostname || "").toLowerCase().trim();
  return h === "tracker.tugeocercas.com" || h.startsWith("tracker.");
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timeout en ${label}`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

export default function AuthCallback() {
  const location = useLocation();
  const navigate = useNavigate();

  const trackerDomain = useMemo(
    () => isTrackerHostname(window.location.hostname),
    []
  );

  const [step, setStep] = useState<Step>("working");
  const [message, setMessage] = useState("Estableciendo sesión…");
  const [detail, setDetail] = useState("");

  useEffect(() => {
    let alive = true;

    const run = async () => {
      try {
        const params = new URLSearchParams(location.search);
        const token_hash = params.get("token_hash");
        const type = params.get("type");

        if (!token_hash || !type) {
          throw new Error("Falta token_hash o type en el callback");
        }

        setMessage("Verificando enlace…");

        const { error } = await withTimeout(
          supabase.auth.verifyOtp({
            token_hash,
            type: type as any,
          }),
          15000,
          "verifyOtp"
        );

        if (error) throw error;

        const { data } = await supabase.auth.getSession();
        if (!data?.session) {
          throw new Error("Sesión no creada después de verifyOtp");
        }

        if (!alive) return;
        setStep("success");

        navigate(trackerDomain ? "/tracker-gps" : "/inicio", {
          replace: true,
        });
      } catch (e: any) {
        console.error("[AuthCallback] error:", e);
        if (!alive) return;
        setStep("error");
        setMessage("Error de autenticación");
        setDetail(e?.message || String(e));
      }
    };

    run();
    return () => {
      alive = false;
    };
  }, [location.search, navigate, trackerDomain]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="bg-white border rounded-xl p-6 max-w-md">
        <h1 className="font-semibold text-lg">App Geocercas</h1>
        <p className="text-sm text-slate-600">{message}</p>
        {step === "error" && (
          <pre className="mt-3 text-xs text-red-600 whitespace-pre-wrap">
            {detail}
          </pre>
        )}
      </div>
    </div>
  );
}
