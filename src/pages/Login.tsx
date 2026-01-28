// src/pages/Login.tsx
import React, { useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

function withTimeout<T>(promise: Promise<T>, ms: number, label = "timeout"): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`[Login] ${label} (${ms}ms)`)), ms);
    promise
      .then((v) => {
        clearTimeout(t);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(t);
        reject(e);
      });
  });
}

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    return email.trim().length > 3 && password.length >= 6 && !loading;
  }, [email, password, loading]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);

    try {
      // Log mínimo para depurar en consola sin ensuciar.
      console.log("[Login] intentando signInWithPassword…", { email });

      const { data, error } = await withTimeout(
        supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        }),
        15000,
        "Supabase signInWithPassword no respondió"
      );

      if (error) {
        console.error("[Login] error signInWithPassword:", error);
        throw error;
      }

      // data.session debe venir si login OK
      if (!data?.session) {
        console.warn("[Login] login OK pero sin session en respuesta:", data);
      }

      // Verificación rápida: token en localStorage
      const keys = Object.keys(localStorage).filter((k) => k.includes("auth-token"));
      console.log("[Login] localStorage auth keys:", keys);

      // Redirección: deja que tu AuthContext/router se encargue
      // (si ya tienes guard/redirect en App.jsx, esto es suficiente)
    } catch (e: any) {
      const msg =
        e?.message ||
        e?.error_description ||
        e?.error ||
        "Error desconocido al iniciar sesión";
      setErr(msg);
    } finally {
      // ✅ esto evita el “colgado”
      setLoading(false);
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
          (LOGIN-V32 Supabase Auth) — crea sesión persistente y habilita RLS automáticamente.
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

        <div style={{ marginTop: 14, opacity: 0.85, fontSize: 13, lineHeight: 1.35 }}>
          Después del login, revisa consola: debe existir <b>sb-geocercas-auth-token</b> en localStorage.
          Si no aparece, revisa Env Vars en Vercel.
        </div>
      </form>
    </div>
  );
  window.supabase = supabase;
}
