// src/components/LoginForm.jsx
import React, { useState } from "react";
import { supabase } from "../supabaseClient";

const inputClass =
  "w-full border rounded-xl px-3 py-2 bg-white " +
  "!text-gray-900 caret-black !placeholder:text-gray-400 " +
  "autofill:shadow-[inset_0_0_0px_1000px_rgb(255,255,255)] " +
  "autofill:[-webkit-text-fill-color:rgb(17,24,39)] " +
  "autofill:caret-black";

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
      setMsg(err?.message || "No se pudo iniciar sesión");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-[70vh] flex items-center justify-center p-6 bg-slate-50 !text-gray-900"
      style={{ color: "#111827", backgroundColor: "#f8fafc" }}
    >
      <div
        className="w-full max-w-md p-6 border rounded-2xl bg-white shadow-sm !text-gray-900"
        style={{ color: "#111827", backgroundColor: "#ffffff" }}
      >
        <h1 className="text-xl font-semibold mb-4 !text-gray-900">Inicia sesión</h1>

        <form onSubmit={handleSubmit} className="grid gap-3">
          <input
            type="email"
            required
            placeholder="tu@correo.com"
            className={inputClass}
            style={{ color: "#111827", backgroundColor: "#ffffff" }}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="password"
            required
            placeholder="••••••••"
            className={inputClass}
            style={{ color: "#111827", backgroundColor: "#ffffff" }}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <button
            className="w-full rounded-xl px-4 py-2 !bg-black !text-white disabled:opacity-60"
            style={{ backgroundColor: "#000", color: "#fff", opacity: 1 }}
            disabled={loading}
          >
            {loading ? "Entrando…" : "Entrar"}
          </button>
        </form>

        {msg && <p className="mt-3 text-sm !text-gray-900">{msg}</p>}
      </div>
    </div>
  );
}
