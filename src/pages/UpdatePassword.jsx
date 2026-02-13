// src/pages/UpdatePassword.jsx
import React, { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

function safeNextPath(next) {
  if (!next) return "/inicio";
  if (next.startsWith("/")) return next;
  return "/inicio";
}

export default function UpdatePassword() {
  const navigate = useNavigate();
  const location = useLocation();

  const rpNext = useMemo(() => {
    const sp = new URLSearchParams(location.search || "");
    return safeNextPath(sp.get("rp_next") || sp.get("next") || "/inicio");
  }, [location.search]);

  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState(null); // { type, text }

  const inputClass =
    "w-full rounded-xl border px-3 py-2 outline-none focus:ring " +
    "bg-white !text-gray-900 caret-black !placeholder:text-gray-400";

  async function handleUpdate(e) {
    e.preventDefault();
    setMsg(null);

    if (!password || password.length < 6) {
      setMsg({ type: "error", text: "La contraseña debe tener al menos 6 caracteres." });
      return;
    }
    if (password !== password2) {
      setMsg({ type: "error", text: "Las contraseñas no coinciden." });
      return;
    }

    try {
      setSubmitting(true);

      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      setMsg({ type: "success", text: "✅ Contraseña actualizada. Entrando..." });

      // Ya hay sesión recovery; puedes ir directo al destino
      setTimeout(() => navigate(rpNext, { replace: true }), 800);
    } catch (e2) {
      setMsg({ type: "error", text: e2?.message || "No se pudo actualizar la contraseña" });
    } finally {
      setSubmitting(false);
    }
  }

  const boxClass =
    msg?.type === "success"
      ? "border-green-200 bg-green-50 text-green-700"
      : msg?.type === "error"
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6 bg-slate-50">
      <div className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-gray-900">Actualizar contraseña</h2>

        {msg && (
          <div className={`mt-4 rounded-xl border p-3 text-sm ${boxClass}`}>
            {msg.text}
          </div>
        )}

        <form onSubmit={handleUpdate} className="mt-6 space-y-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-900">Nueva contraseña</label>
            <input
              className={inputClass}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
              placeholder="••••••••"
              autoComplete="new-password"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-900">Confirmar contraseña</label>
            <input
              className={inputClass}
              type="password"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              minLength={6}
              required
              placeholder="••••••••"
              autoComplete="new-password"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-black px-4 py-2 text-white disabled:opacity-60"
          >
            {submitting ? "Actualizando…" : "Guardar"}
          </button>

          <button
            type="button"
            className="w-full rounded-xl border px-4 py-2 text-gray-900 bg-white"
            onClick={() => navigate("/login", { replace: true })}
          >
            Volver a Login
          </button>
        </form>

        <p className="mt-4 text-xs text-gray-500">
          Luego de actualizar, irás a: <span className="break-all">{rpNext}</span>
        </p>
      </div>
    </div>
  );
}
