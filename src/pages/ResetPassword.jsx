// src/pages/ResetPassword.jsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import { useNavigate, useSearchParams } from "react-router-dom";

function isStrongEnough(pw) {
  const s = String(pw || "");
  return s.length >= 8 && /[A-Za-z]/.test(s) && /\d/.test(s);
}

// Lee params tanto de ?query como de #hash
function parseUrlParams() {
  const query = new URLSearchParams(window.location.search);
  const hashRaw = (window.location.hash || "").replace(/^#/, "");
  const hash = new URLSearchParams(hashRaw);

  return {
    token_hash: query.get("token_hash") || "",
    type: (query.get("type") || hash.get("type") || "").toLowerCase(), // recovery
    code: query.get("code") || "",
    access_token: hash.get("access_token") || "",
    refresh_token: hash.get("refresh_token") || "",
  };
}

/**
 * Asegura sesión de Supabase usando cualquiera de los formatos:
 * - ?code=...
 * - #access_token=...&refresh_token=...
 * - ?token_hash=...&type=recovery
 *
 * Devuelve true si deja sesión activa en memoria.
 */
async function ensureSessionFromUrl() {
  // 1) Si ya hay sesión, listo
  const { data: s0 } = await supabase.auth.getSession();
  if (s0?.session?.user?.id) return true;

  const { token_hash, type, code, access_token, refresh_token } = parseUrlParams();

  // 2) PKCE code
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data?.session?.user?.id) return true;
  }

  // 3) Hash tokens
  if (access_token && refresh_token) {
    const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });
    if (!error && data?.session?.user?.id) return true;
  }

  // 4) token_hash + type
  if (token_hash && type) {
    const { data, error } = await supabase.auth.verifyOtp({ token_hash, type });
    if (!error && data?.session?.user?.id) return true;
  }

  return false;
}

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams(); // rerender cuando cambie query

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

  // Bootstrap: solo verifica que el link permite crear sesión
  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      setChecking(true);
      setReady(false);
      setMsg(null);

      try {
        const ok = await ensureSessionFromUrl();
        if (cancelled) return;

        if (!ok) {
          setMsg({
            type: "error",
            text:
              "No se pudo crear sesión con el link de recuperación. Genera un reset nuevo y ábrelo en incógnito.",
          });
          setReady(false);
          return;
        }

        // Limpieza de URL para que no queden tokens visibles (opcional pero recomendado)
        // Mantiene la pantalla en /reset-password
        window.history.replaceState({}, document.title, "/reset-password");

        setReady(true);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

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

      // 🔥 CLAVE: Re-asegurar sesión justo antes de updateUser (no dependemos de persistencia)
      const ok = await ensureSessionFromUrl();
      if (!ok) {
        setMsg({
          type: "error",
          text:
            "Auth session missing. Abre el link de recuperación nuevamente (mejor en incógnito) o genera uno nuevo.",
        });
        return;
      }

      // Ahora sí, cambia password
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        setMsg({ type: "error", text: error.message || "No se pudo actualizar." });
        return;
      }

      setMsg({ type: "success", text: "✅ Contraseña actualizada. Ya puedes iniciar sesión." });

      // Forzar login limpio con la nueva contraseña
      await supabase.auth.signOut().catch(() => {});
      setTimeout(() => navigate("/login", { replace: true }), 900);
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
        <h1 className="text-xl font-semibold mb-2">Actualizar contraseña</h1>
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
              {busy ? "Guardando…" : "Guardar"}
            </button>

            <div className="text-[11px] text-slate-500">
              Tip: genera un link nuevo y ábrelo en incógnito.
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
