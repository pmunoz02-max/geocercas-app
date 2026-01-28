// src/pages/Login.tsx
import React, { useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function Login() {
  const [email, setEmail] = useState("ruebageo@gmail.com");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Evita dobles submits y permite "cancelar" intentos previos lógicamente
  const attemptIdRef = useRef(0);

  const canSubmit = useMemo(() => {
    return email.trim().length > 3 && password.length >= 6 && !loading;
  }, [email, password, loading]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    // Nuevo intento
    attemptIdRef.current += 1;
    const myAttempt = attemptIdRef.current;

    setErr(null);
    setLoading(true);

    try {
      console.log("[Login] attempt", myAttempt, "signInWithPassword…", { email });

      const res = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      // Si ya hubo otro intento posterior, ignoramos este resultado
      if (myAttempt !== attemptIdRef.current) {
        console.warn("[Login] attempt", myAttempt, "ignorado (hay intento más nuevo)");
        return;
      }

      console.log("[Login] attempt", myAttempt, "signIn result:", res);

      if (res.error) throw res.error;

      // Confirmación de sesión real (esto es la verdad)
      const sessionRes = await supabase.auth.getSession();
      console.log("[Login] attempt", myAttempt, "getSession:", sessionRes);

      const keys = Object.keys(localStorage).filter((k) => k.includes("auth-token"));
      console.log("[Login] attempt", myAttempt, "localStorage auth keys:", keys);

      // Llamada a contexto
      const ctxRes = await supabase.rpc("get_my_context");
      console.log("[Login] attempt", myAttempt, "CTX:", ctxRes);

      // No redirigimos aún en modo debug.
      // Cuando CTX salga ok:true, reactivamos redirect y limpiamos logs.
    } catch (e: any) {
      console.error("[Login] attempt", myAttempt, "ERROR:", e);
      const msg = e?.message || e?.error_description || e?.error || "Error al iniciar sesión";
      setErr(msg);
    } finally {
      // Solo el intento vigente puede apagar loading
      if (myAttempt === attemptIdRef.current) {
        setLoading(false);
      }
      console.log("[Login] attempt", myAttempt, "finally");
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16 }}>
      <form
        onSubmit={handleLogin}
        style={{
          width: "min(520px, 100%)",
          padding: 24,
          borderRadius: 16,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(10,16,28,0.65)",
          color: "white",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 34, fontWeight: 800 }}>Iniciar sesión</h1>
        <p style={{ marginTop: 8, opacity: 0.85 }}>
          (LOGIN Debug vFinal) — sin timeout, log de sesión real + CTX.
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
      </form>
    </div>
  );
}
