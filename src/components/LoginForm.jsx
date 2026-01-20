import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";

/**
 * Ruta B (API-first):
 * - Login web NO usa supabase-js.
 * - Login web llama a /api/auth/password para setear cookies tg_at/tg_rt (HttpOnly).
 * - Luego navega a "next".
 */
export default function LoginForm() {
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // next puede venir por query (?next=/invitar-tracker) o por state
  const search = new URLSearchParams(location.search);
  const nextFromQuery = search.get("next");
  const nextFromState = location.state?.next;
  const next = nextFromQuery || nextFromState || "/";

  async function onSubmit(e) {
    e.preventDefault();
    setError("");

    const cleanEmail = String(email || "").trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setError("Email inválido.");
      return;
    }
    if (!password) {
      setError("Debes ingresar tu contraseña.");
      return;
    }

    setLoading(true);
    try {
      const r = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "include", // clave: permite set-cookie tg_at/tg_rt
        body: JSON.stringify({
          email: cleanEmail,
          password,
          next,     // el endpoint puede devolverlo en JSON
          json: true, // pedimos JSON para no depender de redirect server
        }),
      });

      let data = null;
      try {
        data = await r.json();
      } catch {
        data = null;
      }

      if (!r.ok) {
        const msg =
          data?.error ||
          data?.message ||
          "No se pudo iniciar sesión. Verifica credenciales.";
        setError(msg);
        return;
      }

      // ✅ cookies tg_at/tg_rt ya quedaron seteadas por el server
      navigate(next, { replace: true });
    } catch (err) {
      setError(`Error de red: ${String(err?.message || err)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Email</label>
        <input
          className="w-full border rounded px-3 py-2"
          type="email"
          value={email}
          autoComplete="email"
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tu@email.com"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Contraseña</label>
        <input
          className="w-full border rounded px-3 py-2"
          type="password"
          value={password}
          autoComplete="current-password"
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />
      </div>

      <button
        disabled={loading}
        className="w-full bg-emerald-600 text-white rounded px-4 py-2"
      >
        {loading ? "Ingresando…" : "Ingresar"}
      </button>

      {error ? (
        <div className="text-sm text-red-600">{error}</div>
      ) : null}
    </form>
  );
}
