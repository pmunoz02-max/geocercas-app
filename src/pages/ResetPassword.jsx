// src/pages/ResetPassword.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

/**
 * ResetPassword (Ruta B API-first)
 * - NO usa supabase.auth.updateUser (evita "Auth session missing")
 * - Llama a tu endpoint: POST /api/auth/recovery
 * - Incluye hardening UI: pointer-events + zIndex para evitar overlays que “roban” el click
 * - Incluye diagnóstico visible (temporal) para ver si el click realmente dispara fetch
 */

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
  const [msg, setMsg] = useState(null); // { type: "success"|"warn"|"error", text }
  const [diag, setDiag] = useState(null); // debug visible

  useEffect(() => {
    // Diagnóstico para confirmar que el componente realmente está montado
    // (si no aparece en consola, estás viendo otro build/route)
    // eslint-disable-next-line no-console
    console.log("[ResetPassword] mounted", {
      hasTokenHash: Boolean(token_hash),
      type,
      href: window.location.href,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canSave = useMemo(() => {
    return (
      Boolean(token_hash) &&
      password &&
      password2 &&
      password === password2 &&
      isStrongEnough(password)
    );
  }, [token_hash, password, password2]);

  async function handleSave() {
    // eslint-disable-next-line no-console
    console.log("[ResetPassword] CLICK DETECTED");
    setMsg(null);
    setDiag(null);

    if (!token_hash) {
      setMsg({ type: "error", text: "Link inválido o incompleto. Genera un reset nuevo." });
      return;
    }

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

      // eslint-disable-next-line no-console
      console.log("[ResetPassword] calling /api/auth/recovery");

      const resp = await fetch("/api/auth/recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // no hace daño; tu endpoint no depende de cookies
        body: JSON.stringify({
          token_hash,
          type,
          new_password: password,
        }),
      });

      const data = await resp.json().catch(() => ({}));

      setDiag({
        step: "api_response",
        status: resp.status,
        ok: resp.ok,
        data,
      });

      if (!resp.ok || !data?.ok) {
        setMsg({
          type: "error",
          text:
            data?.error ||
            `No se pudo actualizar (HTTP ${resp.status}). Genera un link nuevo e intenta otra vez.`,
        });
        return;
      }

      setMsg({
        type: "success",
        text: "✅ Contraseña actualizada. Redirigiendo a login…",
      });

      // Limpia la URL (evita dejar token en barra)
      try {
        window.history.replaceState({}, document.title, "/reset-password");
      } catch {}

      setTimeout(() => navigate("/login", { replace: true }), 900);
    } catch (e) {
      setMsg({ type: "error", text: e?.message || "Error inesperado." });
      setDiag({ step: "exception", error: e?.message || String(e) });
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
    <div
      className="min-h-[70vh] flex items-center justify-center px-4"
      style={{
        pointerEvents: "auto",
        zIndex: 40,
        position: "relative",
      }}
    >
      <div
        className="w-full max-w-md bg-white border rounded-2xl p-6"
        style={{
          pointerEvents: "auto",
          zIndex: 45,
          position: "relative",
        }}
      >
        <h1 className="text-xl font-semibold mb-2">Actualizar contraseña</h1>
        <p className="text-sm text-slate-600 mb-4">Ingresa una nueva contraseña para tu cuenta.</p>

        {!token_hash ? (
          <div className="space-y-3">
            <div className="text-sm text-red-600">
              Link inválido o incompleto. Genera un reset nuevo.
            </div>
            <button
              type="button"
              className="w-full bg-slate-900 text-white rounded-lg px-4 py-2 text-sm"
              style={{ pointerEvents: "auto", zIndex: 50, position: "relative" }}
              onClick={() => navigate("/login", { replace: true })}
            >
              Ir a Login
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-3">
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
                  style={{ pointerEvents: "auto", zIndex: 50, position: "relative" }}
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
                  style={{ pointerEvents: "auto", zIndex: 50, position: "relative" }}
                />
              </div>

              {msg ? <div className={`text-sm ${msgClass}`}>{msg.text}</div> : null}

              <button
                type="button"
                onClick={handleSave}
                disabled={busy}
                className="w-full bg-emerald-600 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-60"
                style={{
                  pointerEvents: "auto",
                  zIndex: 50,
                  position: "relative",
                }}
              >
                {busy ? "Guardando…" : "Guardar"}
              </button>

              {/* Diagnóstico temporal para cerrar el bug (remover cuando ya funcione) */}
              {diag ? (
                <pre className="mt-2 text-[10px] whitespace-pre-wrap bg-slate-50 border rounded-lg p-2 text-slate-700">
                  {JSON.stringify(diag, null, 2)}
                </pre>
              ) : null}

              <div className="text-[11px] text-slate-500">
                Tip: si el link expiró, genera uno nuevo.
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
