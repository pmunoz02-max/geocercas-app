// src/pages/Login.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

export default function Login() {
  const navigate = useNavigate();
  const [sp] = useSearchParams();

  const [email, setEmail] = useState("ruebageo@gmail.com");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // ✅ Si Supabase devuelve callback aquí, lo reenviamos a /auth/callback
  useEffect(() => {
    const search = window.location.search || "";
    const hash = window.location.hash || "";

    const hasCode = search.includes("code=");
    const hasTokenHash = search.includes("token_hash=");
    const hasAccessToken = hash.includes("access_token=");

    if (hasCode || hasTokenHash || hasAccessToken) {
      window.location.replace(`/auth/callback${search}${hash}`);
      return;
    }

    // ✅ Si ya hay sesión, no debe quedarse en login
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data?.session) {
        const next = sp.get("next");
        navigate(next ? String(next) : "/inicio", { replace: true });
      }
    })();
  }, [navigate, sp]);

  const canSubmit = useMemo(() => {
    return email.trim().length > 3 && password.length >= 6 && !loading;
  }, [email, password, loading]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) throw error;

      const next = sp.get("next");
      navigate(next ? String(next) : "/inicio", { replace: true });
    } catch (e: any) {
      setErr(e?.message || "Error al iniciar sesión");
    } finally {
      setLoading(false);
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
          Accede con tu correo y contraseña (Supabase Auth).
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

        <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <Link to="/forgot-password" style={{ color: "white", opacity: 0.85, textDecoration: "underline" }}>
            ¿Olvidaste tu contraseña?
          </Link>
          <Link to="/" style={{ color: "white", opacity: 0.85, textDecoration: "underline" }}>
            Volver al inicio
          </Link>
        </div>
      </form>
    </div>
  );
}
