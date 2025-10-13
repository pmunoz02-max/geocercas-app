import { useState } from "react";
import { supabase } from "../lib/supabase";

export default function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    if (error) setError(error.message);
    else onLogin(data.user);
  }

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#f6f7fb",
      fontFamily: "system-ui"
    }}>
      <form
        onSubmit={handleLogin}
        style={{
          background: "white",
          padding: 24,
          borderRadius: 12,
          width: 320,
          boxShadow: "0 8px 16px rgba(0,0,0,.1)"
        }}
      >
        <h2 style={{ textAlign: "center", marginBottom: 12 }}>
          Iniciar sesión
        </h2>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{
            width: "100%",
            padding: "10px 12px",
            border: "1px solid #ddd",
            borderRadius: 8,
            marginBottom: 10,
          }}
        />
        <input
          type="password"
          placeholder="Contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={{
            width: "100%",
            padding: "10px 12px",
            border: "1px solid #ddd",
            borderRadius: 8,
            marginBottom: 10,
          }}
        />
        {error && (
          <p style={{ color: "red", fontSize: 13, marginBottom: 8 }}>{error}</p>
        )}
        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            background: "#2563eb",
            color: "white",
            padding: "10px 12px",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          {loading ? "Ingresando..." : "Entrar"}
        </button>

        <p style={{ fontSize: 12, marginTop: 10, opacity: 0.7 }}>
          Usa: <b>admin@fenice.ec</b> o <b>tracker@fenice.ec</b>
        </p>
      </form>
    </div>
  );
}
