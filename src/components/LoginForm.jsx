// src/components/LoginForm.jsx
import React, { useState } from "react";
import { supabase }from "../supabaseClient" ;

export default function LoginForm({ onLogin = () => {} }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMsg("");
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      setMsg("✅ Sesión iniciada");
      onLogin();
    } catch (err) {
      setMsg(err.message || "No se pudo iniciar sesión");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto p-6 border rounded-2xl bg-white">
      <h1 className="text-xl font-semibold mb-4">Inicia sesión</h1>
      <form onSubmit={handleSubmit} className="grid gap-3">
        <input
          type="email"
          required
          placeholder="tu@correo.com"
          className="border rounded px-3 py-2"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          required
          placeholder="••••••••"
          className="border rounded px-3 py-2"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button className="bg-blue-600 text-white px-3 py-2 rounded disabled:opacity-60" disabled={loading}>
          {loading ? "Entrando…" : "Entrar"}
        </button>
      </form>
      {msg && <p className="mt-3 text-sm">{msg}</p>}
    </div>
  );
}
