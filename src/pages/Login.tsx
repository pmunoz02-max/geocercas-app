// src/pages/Login.tsx
import React, { useMemo, useRef, useState } from "react";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../lib/supabaseClient";

async function fetchWithTimeout(url: string, options: RequestInit, ms: number) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
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
    setCtxText("PASO 1/2: fetch /auth/v1/token…");

    try {
      const base = SUPABASE_URL.replace(/\/$/, "");
      const tokenUrl = `${base}/auth/v1/token?grant_type=password`;

      const res = await fetchWithTimeout(
        tokenUrl,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ email: email.trim(), password }),
        },
        25000
      );

      if (myAttempt !== attemptIdRef.current) return;

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`[Auth token] HTTP ${res.status}: ${text}`);
      }

      const json = await res.json();
      const access_token = json?.access_token;

      if (!access_token) throw new Error("[Auth token] Respuesta sin access_token");

      setCtxText("PASO 1/2: OK ✅\nPASO 2/2: fetch rpc get_my_context…");

      // ✅ Llamada a RPC vía REST usando Bearer token (sin setSession)
      const rpcUrl = `${base}/rest/v1/rpc/get_my_context`;

      const rpcRes = await fetchWithTimeout(
        rpcUrl,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${access_token}`,
          },
          body: "{}",
        },
        25000
      );

      const rpcText = await rpcRes.text();
      let rpcJson: any = null;
      try {
        rpcJson = rpcText ? JSON.parse(rpcText) : null;
      } catch {
        rpcJson = rpcText;
      }

      const safe = {
        rpcStatus: rpcRes.status,
        rpcBody: rpcJson,
      };

      setCtxText(
        `PASO 1/2: OK ✅\nPASO 2/2: OK ✅ (HTTP ${rpcRes.status})\n\n` +
          JSON.stringify(safe, null, 2)
      );
    } catch (e: any) {
      const msg =
        e?.name === "AbortError"
          ? "Timeout (AbortError): la llamada tardó demasiado"
          : e?.message || "Error al iniciar sesión";
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
          (LOGIN Rescue v2) — token por fetch + RPC con Bearer (sin setSession).
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
