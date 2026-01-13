// src/pages/ResetPassword.jsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import { useNavigate, useSearchParams } from "react-router-dom";

function isStrongEnough(pw) {
  const s = String(pw || "");
  // mínimo 8; al menos 1 letra y 1 número (ajústalo si quieres)
  return s.length >= 8 && /[A-Za-z]/.test(s) && /\d/.test(s);
}

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const token_hash = searchParams.get("token_hash") || "";
  const type = (searchParams.get("type") || "").toLowerCase(); // "recovery" esperado

  const [checking, setChecking] = useState(true);
  const [ready, setReady] = useState(false);

  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { type: "error"|"success"|"warn", text }

  const canSubmit = useMemo(() => {
    if (!password || !password2) return false;
    if (password !== password2) return false;
    return isStrongEnough(password);
  }, [password, password2]);

  // ✅ UNIVERSAL: si llegamos aquí con token_hash&type y NO hay sesión, verificamos OTP aquí mismo.
  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      setChecking(true);
      setReady(false);
      setMsg(null);

      try {
        // 1) ¿ya hay sesión?
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (cancelled) return;

        if (session?.user?.id) {
          setReady(true);
          return;
        }

        // 2) Si no hay sesión, intentamos verificar OTP si viene token_hash.
        // Esto hace el flujo robusto incluso si /auth/callback no se ejecutó.
        if (token_hash && type) {
          const { data, error } = await supabase.auth.verifyOtp({
            token_hash,
            type, // debe ser "recovery" normalmente
          });

          if (cancelled) return;

          if (error) {
            setMsg({
              type: "error",
              text:
                "El link de recuperación es inválido o expiró. Genera uno nuevo e inténtalo en incógnito.",
            });
            setReady(false);
            return;
          }

          // verifyOtp crea sesión
          if (data?.session?.user?.id) {
            setReady(true);
            return;
          }
        }

        // 3) Si no hay sesión y no hay token válido:
        setMsg({
          type: "error",
          text:
            "Faltan parámetros de recuperación o no hay sesión. Solicita un nuevo link de recuperación.",
        });
        setReady(false);
      } catch (e) {
        if (cancelled) return;
        setMsg({ type: "error", text: e?.message || "Error inesperado." });
        setReady(false);
      } finally {
        if (!cancelled) setChecking(false);
      }
    }

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, [token_hash, type]);

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg(null);

    if (!canSubmit) {
      setMsg({
        type: "warn",
        text:
          "Revisa tu contraseña: mínimo 8 caracteres, incluye letras y números, y ambas entradas deben coincidir.",
      });
      return;
    }

    try {
      setBusy(true);

      // Asegura sesión antes de updateUser
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

      if (error) {
        setMsg({ type: "error", text: error.message || "No se pudo actualizar." });
        return;
      }

      setMsg({ type: "success", text: "✅ Contraseña actualizada. Ya puedes iniciar sesión." });

      // opcional: cerrar sesión para forzar login con la nueva contraseña
      await supabase.auth.signOut().catch(() => {});
      setTimeout(() => navigate("/login", { replace: true }), 800);
    } catch (e2) {
      setMsg({ type: "error", text: e2?.message || "Error inesperado." });
    } finally {
      setBusy(false);
    }
  }

  const msgClass =
    msg?.type === "success"
      ? "text-emerald-700"
      : msg?.type === "warn"
      ? "text-amber-700"
      : "text-red-600";

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white border rounded-2xl p-6">
        <h1 className="text-xl font-semibold mb-2">Recrear contraseña</h1>
        <p className="text-sm text-slate-600 mb-4">
          Ingresa una nueva contraseña para tu cuenta.
        </p>

        {checking ? (
          <div className="text-sm text-slate-600">Verificando link…</div>
        ) : !ready ? (
          <div className="space-y-3">
            {msg ? <div className={`text-sm ${msgClass}`}>{msg.text}</div> : null}
            <button
              className="w-full bg-slate-900 text-white rounded-lg px-4 py-2 text-sm"
              onClick={() => navigate("/login", { replace: true })}
            >
              Ir a Login
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nueva contraseña
              </label>
              <input
                type="password"
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mín. 8 caracteres, letras y números"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Repetir contraseña
              </label>
              <input
                type="password"
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                placeholder="Repite la contraseña"
              />
            </div>

            {msg ? <div className={`text-sm ${msgClass}`}>{msg.text}</div> : null}

            <button
              disabled={busy}
              className="w-full bg-emerald-600 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-60"
            >
              {busy ? "Guardando…" : "Guardar nueva contraseña"}
            </button>

            <div className="text-[11px] text-slate-500">
              Tip: si falla, genera un link nuevo y ábrelo en incógnito.
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
