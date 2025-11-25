// src/pages/ResetPassword.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient"; // ← named import y ruta correcta

// Lee parámetros del hash (#) o query (?) que envía Supabase
function useAuthParams() {
  return useMemo(() => {
    const raw = window.location.hash?.startsWith("#")
      ? window.location.hash.substring(1)
      : window.location.search?.startsWith("?")
      ? window.location.search.substring(1)
      : "";
    const params = new URLSearchParams(raw);
    return {
      access_token: params.get("access_token") || "",
      refresh_token: params.get("refresh_token") || "",
      type: params.get("type") || "",
    };
  }, []);
}

export default function ResetPassword() {
  const { access_token, refresh_token, type } = useAuthParams();
  const [isSessionReady, setIsSessionReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(false);

  // 1) Establece sesión si viene desde el email (token en URL)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setMsg(null); setErr(null);
        if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });
          if (error) throw error;
          if (mounted) setIsSessionReady(true);
        } else {
          // Si ya hay sesión previa en el SDK, también sirve
          const { data } = await supabase.auth.getSession();
          if (data.session) {
            if (mounted) setIsSessionReady(true);
          } else {
            if (mounted) setErr("No se encontró un token de recuperación. Solicita un nuevo enlace.");
          }
        }
      } catch (e) {
        setErr(e?.message ?? "Error preparando la sesión de recuperación.");
      }
    })();
    return () => { mounted = false; };
  }, [access_token, refresh_token]);

  // 2) Actualiza la contraseña
  const onSubmit = async (e) => {
    e.preventDefault();
    setErr(null); setMsg(null);

    if (password.length < 8) {
      setErr("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      setErr("Las contraseñas no coinciden.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) setErr(error.message);
    else {
      setMsg("✅ Contraseña actualizada. Ya puedes iniciar sesión con tu nueva contraseña.");
      // Limpia el hash para ocultar tokens en la barra del navegador
      try { window.history.replaceState({}, document.title, window.location.pathname); } catch {}
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl shadow-lg p-6">
        <h1 className="text-xl font-semibold mb-3">Restablecer contraseña</h1>

        {!isSessionReady && !err && (
          <p className="text-sm text-gray-600">Preparando sesión de recuperación…</p>
        )}

        {err && <div className="bg-red-50 text-red-700 p-3 rounded mb-4">{err}</div>}
        {msg && <div className="bg-green-50 text-green-700 p-3 rounded mb-4">{msg}</div>}

        {isSessionReady && !msg && (
          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            {type === "recovery" && (
              <p className="text-xs text-gray-500">Enlace de recuperación verificado.</p>
            )}

            <label className="text-sm">
              Nueva contraseña
              <input
                type="password"
                className="mt-1 w-full border rounded p-2"
                placeholder="Mínimo 8 caracteres"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>

            <label className="text-sm">
              Repite la contraseña
              <input
                type="password"
                className="mt-1 w-full border rounded p-2"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </label>

            <button
              type="submit"
              disabled={loading}
              className="bg-blue-600 text-white rounded p-2 hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Actualizando…" : "Cambiar contraseña"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
