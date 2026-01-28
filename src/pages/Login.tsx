// src/pages/Login.tsx
import React, { useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";

function stepTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`[Timeout] ${label} (${ms}ms)`)), ms);
    p.then((v) => {
      clearTimeout(t);
      resolve(v);
    }).catch((e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

export default function Login() {
  const [email, setEmail] = useState("ruebageo@gmail.com");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const [err, setErr] = useState<string | null>(null);
  const [ctxText, setCtxText] = useState<string>("(sin ejecutar aún)");

  const attemptIdRef = useRef(0);

  const canSubmit = useMemo(() => {
    return email.trim().length > 3 && password.length >= 6 && !loading;
  }, [email, password, loading]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    attemptIdRef.current += 1;
    const myAttempt = attemptIdRef.current;

    setErr(null);
    setLoading(true);
    setCtxText("PASO 1/3: signInWithPassword…");

    try {
      // PASO 1: Login (timeout largo)
      const signRes = await stepTimeout(
        supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        }),
        45000,
        "signInWithPassword"
      );

      if (myAttempt !== attemptIdRef.current) return;
      if (signRes.error) throw signRes.error;

      setCtxText("PASO 1/3: OK ✅\nPASO 2/3: getSession…");

      // PASO 2: Session real (timeout corto)
      const sessionRes = await stepTimeout(
        supabase.auth.getSession(),
        20000,
        "getSession"
      );

      const hasSession = !!sessionRes?.data?.session?.access_token;

      setCtxText(
        `PASO 1/3: OK ✅\nPASO 2/3: OK ✅ (hasSession=${hasSession})\nPASO 3/3: rpc get_my_context…`
      );

      // PASO 3: RPC Contexto (timeout largo)
      const ctxRes = await stepTimeout(
        supabase.rpc("get_my_context"),
        45000,
        "rpc(get_my_context)"
      );

      const keys = Object.keys(localStorage).filter((k) => k.includes("auth-token"));

      // “Seguro”: sin tokens
      const safe = {
        hasSession,
        authKeys: keys,
        ctx: ctxRes?.data ?? null,
        ctxError: ctxRes?.error ?? null,
      };

      console.log("[Login] SAFE:", safe);
      setCtxText(
        `PASO 1/3: OK ✅\nPASO 2/3: OK ✅ (hasSession=${hasSession})\nPASO 3/3: OK ✅\n\n` +
          JSON.stringify(safe, null, 2)
      );
    } catch (e: any) {
      console.error("[Login] ERROR:", e);
      const msg = e?.message || e?.error_description || e?.error || "Error al iniciar sesión";
      setErr(msg);
      setCtxText(`FALLÓ ❌\n${msg}`);
    } finally {
      if (myAttempt === attemptIdRef.current) setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16 }}>
      <form
        onSubmit={handleLogin}
        style={{
          width: "min(720px, 100%)",
          padding: 24,
          borderRadius: 16,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(10,16,28,0.65)",
          color: "white",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 34, fontWeight: 800 }}>Iniciar sesión</h1>
        <p style={{ marginTop: 8, opacity: 0.85 }}>
          (LOGIN Step Tracer) — muestra en qué paso se cuelga (sin tokens).
        </p>

        {err && (
          <div
            style={{
              marginTop: 12,
              padding: 12,
              borderRadius: 12,
              border: "1px solid rgba(255,80,80,0.35)",
              background: "rgba(255,80,80,0.12)",
              color: "white",
            }}
          >
            {err}
          </div>
        )}

        <div style={{ marginTop: 16 }}>
          <label style={{ display: "block", marginBottom: 6, opacity: 0.9 }}>Correo</label>
          <input
            value={email}
            onChange={(ev) => setEmail(ev.target.value)}
            autoComplete="email"
            inputMode="email"
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.15)",
              background: "rgba(255,255,255,0.06)",
              color: "white",
            }}
          />
        </div>

        <div style={{ marginTop: 14 }}>
          <label style={{ display: "block", marginBottom: 6, opacity: 0.9 }}>Contraseña</label>
          <input
            type="password"
            value={password}
            onChange={(ev) => setPassword(ev.target.value)}
            autoComplete="current-password"
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.15)",
              background: "rgba(255,255,255,0.06)",
              color: "white",
            }}
          />
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          style={{
            width: "100%",
            marginTop: 18,
            padding: "12px 14px",
            borderRadius: 12,
            border: "none",
            fontWeight: 800,
            cursor: canSubmit ? "pointer" : "not-allowed",
            opacity: canSubmit ? 1 : 0.55,
          }}
        >
          {loading ? "Ingresando..." : "Ingresar"}
        </button>

        <div
          style={{
            marginTop: 18,
            padding: 12,
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.06)",
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: 8 }}>CTX / Debug (seguro)</div>
          <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 12 }}>
            {ctxText}
          </pre>
        </div>
      </form>
    </div>
  );
}
