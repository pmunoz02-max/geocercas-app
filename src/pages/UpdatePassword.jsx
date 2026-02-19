// src/pages/UpdatePassword.jsx
// UPDATE-PASSWORD-UNIVERSAL-V3
// Soporta 2 entradas:
// A) Implicit recovery (legacy): /reset-password#access_token=...&refresh_token=...&type=recovery
// B) token_hash (moderno):       /reset-password?token_hash=...&type=recovery   (verifyOtp)
// Objetivo: garantizar sesión antes de supabase.auth.updateUser({ password })

import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

function safeNextPath(next) {
  if (!next) return "/inicio";
  if (next.startsWith("/")) return next;
  return "/inicio";
}

function parseHashParams(hash) {
  const h = (hash || "").startsWith("#") ? hash.slice(1) : hash || "";
  const sp = new URLSearchParams(h);
  return {
    access_token: sp.get("access_token") || "",
    refresh_token: sp.get("refresh_token") || "",
    type: (sp.get("type") || "").toLowerCase(),
    error: sp.get("error") || sp.get("error_description") || "",
  };
}

function isStrongEnough(pw) {
  const s = String(pw || "");
  // mantenemos mínimo 6 como tenías, pero mejor si es 8+ con letras/números
  return s.length >= 6;
}

export default function UpdatePassword() {
  const navigate = useNavigate();
  const location = useLocation();

  const rpNext = useMemo(() => {
    const sp = new URLSearchParams(location.search || "");
    return safeNextPath(sp.get("rp_next") || sp.get("next") || "/inicio");
  }, [location.search]);

  // token_hash flow (moderno)
  const token_hash = useMemo(() => {
    const sp = new URLSearchParams(location.search || "");
    return sp.get("token_hash") || "";
  }, [location.search]);

  const type_q = useMemo(() => {
    const sp = new URLSearchParams(location.search || "");
    return String(sp.get("type") || "recovery").toLowerCase();
  }, [location.search]);

  const [checking, setChecking] = useState(true);
  const [ready, setReady] = useState(false);

  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState(null); // { type, text }

  const inputClass =
    "w-full rounded-xl border px-3 py-2 outline-none focus:ring " +
    "bg-white !text-gray-900 caret-black !placeholder:text-gray-400";

  useEffect(() => {
    let cancelled = false;

    async function bootstrapRecoverySession() {
      setChecking(true);
      setReady(false);
      setMsg(null);

      try {
        // 0) Si ya hay sesión, listo
        const {
          data: { session: s0 },
        } = await supabase.auth.getSession();

        if (!cancelled && s0?.user?.id) {
          setReady(true);
          return;
        }

        // 1) Caso A: hash implicit recovery (legacy)
        const h = parseHashParams(window.location.hash || "");
        if (h.error) {
          setMsg({
            type: "error",
            text: "El link de recuperación es inválido o expiró. Genera uno nuevo.",
          });
          return;
        }

        if (h.access_token && (h.type === "recovery" || h.type === "magiclink")) {
          const { error } = await supabase.auth.setSession({
            access_token: h.access_token,
            refresh_token: h.refresh_token || "",
          });

          if (cancelled) return;

          if (error) {
            setMsg({
              type: "error",
              text:
                "No se pudo iniciar sesión de recuperación. Genera un link nuevo e inténtalo en incógnito.",
            });
            return;
          }

          // limpia hash (opcional)
          try {
            window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
          } catch {}

          setReady(true);
          return;
        }

        // 2) Caso B: token_hash (moderno)
        if (token_hash) {
          const { data, error } = await supabase.auth.verifyOtp({
            token_hash,
            type: type_q || "recovery",
          });

          if (cancelled) return;

          if (error || !data?.session?.user?.id) {
            setMsg({
              type: "error",
              text: "El link de recuperación es inválido o expiró. Genera uno nuevo.",
            });
            return;
          }

          setReady(true);
          return;
        }

        // 3) Nada que procesar
        setMsg({
          type: "error",
          text: "No hay sesión de recuperación. Solicita un nuevo link de recuperación.",
        });
      } catch (e) {
        if (cancelled) return;
        setMsg({ type: "error", text: e?.message || "Error inesperado." });
      } finally {
        if (!cancelled) setChecking(false);
      }
    }

    bootstrapRecoverySession();
    return () => {
      cancelled = true;
    };
  }, [token_hash, type_q]);

  async function handleUpdate(e) {
    e.preventDefault();
    setMsg(null);

    if (!isStrongEnough(password)) {
      setMsg({ type: "error", text: "La contraseña debe tener al menos 6 caracteres." });
      return;
    }
    if (password !== password2) {
      setMsg({ type: "error", text: "Las contraseñas no coinciden." });
      return;
    }

    try {
      setSubmitting(true);

      // asegura sesión antes de updateUser
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user?.id) {
        setMsg({
          type: "error",
          text:
            "No hay sesión activa para cambiar la contraseña. Abre el link de recuperación nuevamente o genera uno nuevo.",
        });
        return;
      }

      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      setMsg({ type: "success", text: "✅ Contraseña actualizada. Entrando..." });

      // Por seguridad, cerramos sesión recovery y volvemos a login o next
      await supabase.auth.signOut().catch(() => {});
      setTimeout(() => navigate("/login", { replace: true }), 900);
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

        {checking ? (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            Verificando link…
          </div>
        ) : msg ? (
          <div className={`mt-4 rounded-xl border p-3 text-sm ${boxClass}`}>{msg.text}</div>
        ) : null}

        {!checking && !ready ? (
          <div className="mt-6 space-y-3">
            <button
              type="button"
              className="w-full rounded-xl border px-4 py-2 text-gray-900 bg-white"
              onClick={() => navigate("/login", { replace: true })}
            >
              Volver a Login
            </button>
          </div>
        ) : (
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

            {msg && <div className={`rounded-xl border p-3 text-sm ${boxClass}`}>{msg.text}</div>}

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
        )}

        <p className="mt-4 text-xs text-gray-500">
          Luego de actualizar, irás a: <span className="break-all">{rpNext}</span>
        </p>
      </div>
    </div>
  );
}
