// src/components/LoginForm.jsx
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../supabaseClient";
import Button from "./ui/Button";

export default function LoginForm({ onLogin = () => {} }) {
  const { t } = useTranslation();
  const tr = (key, fallback, options = {}) =>
    t(key, { defaultValue: fallback, ...options });

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
      setMsg(tr("login.messages.success", "✅ Session started"));
      onLogin();
    } catch (err) {
      setMsg(err?.message || tr("login.errors.signInFailed", "Algo salió mal"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-bg min-h-screen flex items-center justify-center">
      <div className="auth-card w-full max-w-md">
        <h1 className="text-xl font-semibold mb-4">{tr("login.title", "Iniciar sesión")}</h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium">{tr("login.emailLabel", "Correo electrónico")}</label>
          <input
            type="email"
            required
            placeholder={tr("login.emailPlaceholder", "you@email.com")}
            className="w-full rounded-md px-3 py-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium">{tr("login.passwordLabel", "Contraseña")}</label>
          <input
            type="password"
            required
            placeholder={tr("login.passwordPlaceholder", "••••••••")}
            className="w-full rounded-md px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <Button variant="primary" loading={loading}>Iniciar sesión</Button>
      </form>

        {msg && <div className="banner banner-error">{msg}</div>}
      </div>
    </div>
  );
}