import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

function isStrongEnough(pw) {
  const s = String(pw || "");
  return s.length >= 8 && /[A-Za-z]/.test(s) && /\d/.test(s);
}

function getRecoveryParams() {
  const q = new URLSearchParams(window.location.search);
  const token_hash = q.get("token_hash") || q.get("token") || q.get("recovery_token") || "";
  const type = (q.get("type") || "recovery").toLowerCase();
  return { token_hash, type };
}

export default function ResetPassword() {
  const navigate = useNavigate();
  const { token_hash, type } = getRecoveryParams();

  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // {type,text}

  const canSubmit = useMemo(() => {
    if (!token_hash) return false;
    if (!password || !password2) return false;
    if (password !== password2) return false;
    return isStrongEnough(password);
  }, [token_hash, password, password2]);

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg(null);

    if (!token_hash) {
      setMsg({ type: "error", text: "Link inválido o incompleto. Genera un reset nuevo." });
      return;
    }
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
      const resp = await fetch("/api/auth/recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token_hash, type, new_password: password }),
      });

      const data = await resp.json().catch(() => ({}));

      if (!resp.ok || !data?.ok) {
        setMsg({
          type: "error",
          text: data?.error || "No se pudo actualizar. Genera un link nuevo e intenta otra vez.",
        });
        return;
      }

      setMsg({ type: "success", text: "✅ Contraseña actualizada. Ya puedes iniciar sesión." });

      // Limpia URL
      window.history.replaceState({}, document.title, "/reset-password");

      setTimeout(() => navigate("/login", { replace: true }), 900);
    } catch (err) {
      setMsg({ type: "error", text: err?.message || "Error inesperado." });
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

        {!token_hash ? (
          <div className="space-y-3">
            <div className="text-sm text-red-600">
              Link inválido o incompleto. Genera un reset nuevo.
            </div>
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
              Si falla por link expirado, genera uno nuevo.
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
