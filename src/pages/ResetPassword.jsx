import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

/**
 * ResetPassword
 * - Llegas aquí DESPUÉS de /auth/callback con type=recovery
 * - Debe existir session (usuario autenticado temporalmente)
 */
export default function ResetPassword() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [hasSession, setHasSession] = useState(false);

  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    let alive = true;

    async function init() {
      setLoading(true);
      setErr("");
      try {
        const { data } = await supabase.auth.getSession();
        const session = data?.session ?? null;

        if (!alive) return;

        if (session?.user) {
          setHasSession(true);
        } else {
          setHasSession(false);
          setErr("No hay sesión de recuperación. Solicita un nuevo correo de recuperación e inténtalo otra vez.");
        }
      } catch (e) {
        console.error("[ResetPassword] init error", e);
        if (!alive) return;
        setHasSession(false);
        setErr("No se pudo verificar la sesión. Intenta solicitar un nuevo correo.");
      } finally {
        if (alive) setLoading(false);
      }
    }

    init();
    return () => {
      alive = false;
    };
  }, []);

  async function onSave(e) {
    e.preventDefault();
    setErr("");
    setMsg("");

    if (!password || password.length < 8) {
      setErr("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (password !== password2) {
      setErr("Las contraseñas no coinciden.");
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      setMsg("Contraseña actualizada. Ahora puedes ingresar con tu nueva contraseña.");

      await supabase.auth.signOut();
      setTimeout(() => navigate("/login", { replace: true }), 600);
    } catch (e2) {
      console.error("[ResetPassword] update error", e2);
      setErr(e2?.message || "No se pudo actualizar la contraseña.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-200 p-4">
        <div className="text-sm opacity-80">Cargando…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-200 p-4">
      <div className="max-w-xl w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow">
        <h1 className="text-lg font-semibold">Restablecer contraseña</h1>

        {!hasSession ? (
          <>
            <p className="text-sm opacity-85 whitespace-pre-line">{err}</p>
            <button
              onClick={() => navigate("/login", { replace: true })}
              className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium"
            >
              Ir a Login
            </button>
          </>
        ) : (
          <form onSubmit={onSave} className="space-y-4">
            <div>
              <label className="block text-sm mb-2 opacity-80">Nueva contraseña</label>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                className="w-full px-4 py-3 rounded-xl bg-slate-800/70 border border-slate-700 outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <div>
              <label className="block text-sm mb-2 opacity-80">Confirmar contraseña</label>
              <input
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                type="password"
                className="w-full px-4 py-3 rounded-xl bg-slate-800/70 border border-slate-700 outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>

            {(err || msg) && (
              <div>
                {err ? <div className="text-sm text-red-300">{err}</div> : null}
                {msg ? <div className="text-sm text-emerald-300">{msg}</div> : null}
              </div>
            )}

            <button
              disabled={busy}
              className="w-full py-3 rounded-xl bg-white text-slate-900 font-semibold hover:opacity-95 disabled:opacity-60"
            >
              {busy ? "Guardando…" : "Guardar nueva contraseña"}
            </button>
          </form>
        )}

        <div className="text-[11px] opacity-60">
          Tip: abre el correo de recuperación en Chrome/Safari. Si falló antes, intenta en incógnito y solicita un link nuevo.
        </div>
      </div>
    </div>
  );
}
