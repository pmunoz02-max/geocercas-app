// src/pages/TrackerAuthBridge.jsx
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const COOLDOWN_SECONDS = 40; // Supabase te mostró 36s; ponemos 40 seguro
const LS_KEY = "tracker_otp_last_request_ts";

function nowMs() {
  return Date.now();
}

function getLastTs() {
  const v = Number(localStorage.getItem(LS_KEY) || "0");
  return Number.isFinite(v) ? v : 0;
}

function setLastTs(ts) {
  localStorage.setItem(LS_KEY, String(ts));
}

export default function TrackerAuthBridge() {
  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

  const supabase = useMemo(() => {
    return createClient(supabaseUrl, supabaseAnon, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }, [supabaseUrl, supabaseAnon]);

  const [msg, setMsg] = useState("Listo para autenticar.");
  const [email, setEmail] = useState("");
  const [nextPath, setNextPath] = useState("/tracker-gps");

  const [cooldownLeft, setCooldownLeft] = useState(0);
  const [busy, setBusy] = useState(false);

  // init
  useEffect(() => {
    (async () => {
      try {
        if (!supabaseUrl) {
          setMsg("Falta VITE_SUPABASE_URL.");
          return;
        }
        if (!supabaseAnon) {
          setMsg("Falta VITE_SUPABASE_ANON_KEY.");
          return;
        }

        const nextParam = new URLSearchParams(window.location.search).get("next");
        const next = nextParam ? decodeURIComponent(nextParam) : "/tracker-gps";
        setNextPath(next);

        setMsg("Leyendo sesión de la app...");
        const res = await fetch("/api/auth/session", { credentials: "include" });
        const s = await res.json().catch(() => ({}));

        const em = s?.user?.email || s?.email || s?.profile?.email || "";
        if (!em) {
          setMsg("No se encontró email en sesión. Abre el magic link otra vez.");
          return;
        }
        setEmail(em);

        // Si ya existe sesión Supabase, volver directo al next
        const { data } = await supabase.auth.getSession();
        if (data?.session?.access_token) {
          window.location.replace(next);
          return;
        }

        // calcular cooldown inicial
        const last = getLastTs();
        const elapsed = Math.floor((nowMs() - last) / 1000);
        const left = Math.max(0, COOLDOWN_SECONDS - elapsed);
        setCooldownLeft(left);

        setMsg("Pulsa “Enviar link” para recibir el acceso (evita reintentos seguidos).");
      } catch (e) {
        setMsg(`Error: ${String(e?.message || e)}`);
      }
    })();
  }, [supabase, supabaseUrl, supabaseAnon]);

  // countdown tick
  useEffect(() => {
    if (cooldownLeft <= 0) return;
    const t = setInterval(() => setCooldownLeft((x) => Math.max(0, x - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldownLeft]);

  async function requestOtp() {
    if (!email) return;

    // enforce cooldown (persistente)
    const last = getLastTs();
    const elapsed = Math.floor((nowMs() - last) / 1000);
    const left = Math.max(0, COOLDOWN_SECONDS - elapsed);
    if (left > 0) {
      setCooldownLeft(left);
      setMsg(`Por seguridad, espera ${left}s antes de volver a pedir el link.`);
      return;
    }

    setBusy(true);
    setMsg("Enviando link de acceso...");
    setLastTs(nowMs());
    setCooldownLeft(COOLDOWN_SECONDS);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${window.location.origin}${nextPath}`,
      },
    });

    setBusy(false);

    if (error) {
      setMsg(`Error OTP: ${error.message}`);
      return;
    }

    setMsg("Listo. Revisa tu correo (SPAM/Promociones) y abre el link.");
  }

  const btnDisabled = busy || cooldownLeft > 0 || !email;

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="max-w-md w-full bg-white border rounded-xl p-6 shadow">
        <h2 className="text-lg font-semibold text-gray-800 mb-2">Autenticando tracker…</h2>

        <p className="text-sm text-gray-700 mb-3">{msg}</p>

        <div className="text-xs text-gray-600 mb-3">
          Email: <b>{email || "—"}</b>
        </div>

        <button
          onClick={requestOtp}
          disabled={btnDisabled}
          className={`w-full py-3 rounded-lg text-white ${
            btnDisabled ? "bg-gray-400" : "bg-emerald-600"
          }`}
        >
          {cooldownLeft > 0 ? `Espera ${cooldownLeft}s…` : busy ? "Enviando…" : "Enviar link"}
        </button>

        <p className="text-xs text-gray-500 mt-3">
          Si no llega el correo, revisa SPAM/Promociones. Evita presionar varias veces seguidas.
        </p>
      </div>
    </div>
  );
}
