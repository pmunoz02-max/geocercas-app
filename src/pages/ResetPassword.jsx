// src/pages/ResetPassword.jsx
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

function isStrongEnough(pw) {
  const s = String(pw || "");
  return s.length >= 8 && /[A-Za-z]/.test(s) && /\d/.test(s);
}

function getRecoveryParams() {
  const q = new URLSearchParams(window.location.search);
  return {
    token_hash: q.get("token_hash") || "",
    type: (q.get("type") || "recovery").toLowerCase(),
  };
}

export default function ResetPassword() {
  const navigate = useNavigate();
  const { token_hash, type } = getRecoveryParams();

  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [diag, setDiag] = useState(null);

  const canSave = useMemo(() => {
    return (
      token_hash &&
      password &&
      password2 &&
      password === password2 &&
      isStrongEnough(password)
    );
  }, [token_hash, password, password2]);

  async function handleSave() {
    setMsg(null);
    setDiag(null);

    if (!canSave) {
      setMsg({
        type: "warn",
        text:
          "Contraseña inválida o no coincide. Mínimo 8 caracteres con letras y números.",
      });
      return;
    }

    try {
      setBusy(true);

      console.log("[RESET] calling /api/auth/recovery");

      const resp = await fetch("/api/auth/recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token_hash,
          type,
          new_password: password,
        }),
      });

      const data = await resp.json().catch(() => ({}));
      setDiag({ status: resp.status, data });

      if (!resp.ok || !data?.ok) {
        setMsg({
          type: "error",
          text: data?.error || `Error HTTP ${resp.status}`,
        });
        return;
      }

      setMsg({
        type: "success",
        text: "✅ Contraseña actualizada. Redirigiendo a login…",
      });

      setTimeout(() => navigate("/login", { replace: true }), 1000);
    } catch (e) {
      setMsg({ type: "error", text: e?.message || "Error inesperado" });
      setDiag({ exception: String(e) });
    } finally {
      setBusy(false);
    }
  }

  const msgClass =
    msg?.type === "success"
      ? "text-emerald-600"
      : msg?.type === "warn"
      ? "text-amber-600"
      : "text-red-600";

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white border rounded-xl p-6">
        <h1 className="text-xl font-semibold mb-3">Actualizar contraseña</h1>

        {!token_hash ? (
          <div className="text-red-600 text-sm">
            Link inválido o incompleto.
          </div>
        ) : (
          <>
            <input
              type="password"
              placeholder="Nueva contraseña"
              className="w-full border rounded px-3 py-2 mb-3"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <input
              type="password"
              placeholder="Repetir contraseña"
              className="w-full border rounded px-3 py-2 mb-3"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
            />

            {msg && <div className={`text-sm mb-2 ${msgClass}`}>{msg.text}</div>}

            <button
              type="button"
              onClick={handleSave}
              disabled={busy}
              className="w-full bg-emerald-600 text-white py-2 rounded disabled:opacity-50"
            >
              {busy ? "Guardando…" : "Guardar"}
            </button>

            {diag && (
              <pre className="mt-3 text-[10px] bg-slate-50 p-2 rounded">
                {JSON.stringify(diag, null, 2)}
              </pre>
            )}
          </>
        )}
      </div>
    </div>
  );
}
