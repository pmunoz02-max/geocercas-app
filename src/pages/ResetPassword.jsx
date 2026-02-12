// src/pages/ResetPassword.jsx
// RESET-PASSWORD-IMPLICIT-V2
// Soporta 2 entradas:
// A) Implicit recovery: /reset-password#access_token=...&refresh_token=...&type=recovery
// B) Legacy token_hash: /reset-password?token_hash=...&type=recovery  (verifyOtp)

import React, { useEffect, useMemo, useState } from "react";
<<<<<<< HEAD
import { useNavigate } from "react-router-dom";

/**
 * ResetPassword (Ruta B API-first)
 * - NO usa Supabase client en frontend para updateUser (evita "Auth session missing")
 * - Llama a tu endpoint: POST /api/auth/recovery
 * - Parseo robusto: resp.text() -> JSON.parse seguro (evita "Unexpected end of JSON input")
 * - Incluye diagnóstico visible (temporal) para ver status + respuesta real del API
 */
=======
import { supabase } from "../lib/supabaseClient";
import { useNavigate, useSearchParams } from "react-router-dom";
>>>>>>> preview

function isStrongEnough(pw) {
  const s = String(pw || "");
  return s.length >= 8 && /[A-Za-z]/.test(s) && /\d/.test(s);
}

<<<<<<< HEAD
function getRecoveryParams() {
  const q = new URLSearchParams(window.location.search);
  const token_hash = q.get("token_hash") || q.get("token") || q.get("recovery_token") || "";
  const type = (q.get("type") || "recovery").toLowerCase();
  return { token_hash, type };
=======
function parseHashParams(hash) {
  const h = (hash || "").startsWith("#") ? hash.slice(1) : hash || "";
  const sp = new URLSearchParams(h);
  return {
    access_token: sp.get("access_token") || "",
    refresh_token: sp.get("refresh_token") || "",
    type: (sp.get("type") || "").toLowerCase(),
    error: sp.get("error") || sp.get("error_description") || "",
  };
>>>>>>> preview
}

export default function ResetPassword() {
  const navigate = useNavigate();
<<<<<<< HEAD
  const { token_hash, type } = getRecoveryParams();
=======
  const [searchParams] = useSearchParams();

  const token_hash = searchParams.get("token_hash") || "";
  const type_q = (searchParams.get("type") || "").toLowerCase();

  const [checking, setChecking] = useState(true);
  const [ready, setReady] = useState(false);
>>>>>>> preview

  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");

  const [busy, setBusy] = useState(false);
<<<<<<< HEAD
  const [msg, setMsg] = useState(null); // { type: "success"|"warn"|"error", text }
  const [diag, setDiag] = useState(null); // debug visible

=======
  const [msg, setMsg] = useState(null); // { type, text }

  const canSubmit = useMemo(() => {
    if (!password || !password2) return false;
    if (password !== password2) return false;
    return isStrongEnough(password);
  }, [password, password2]);

>>>>>>> preview
  useEffect(() => {
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

<<<<<<< HEAD
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
        text: "Contraseña inválida o no coincide. Mín. 8 caracteres con letras y números.",
=======
      try {
        // 1) Caso A: hash implicit recovery
        const h = parseHashParams(window.location.hash || "");
        if (h.error) {
          setMsg({
            type: "error",
            text: "El link de recuperación es inválido o expiró. Genera uno nuevo.",
          });
          setReady(false);
          return;
        }

        if (h.access_token && (h.type === "recovery" || h.type === "magiclink")) {
          // Creamos sesión en memoria para permitir updateUser
          const { error } = await supabase.auth.setSession({
            access_token: h.access_token,
            refresh_token: h.refresh_token || "",
          });

          if (cancelled) return;

          if (error) {
            setMsg({
              type: "error",
              text: "No se pudo iniciar sesión de recuperación. Genera un link nuevo e inténtalo en incógnito.",
            });
            setReady(false);
            return;
          }

          // limpiamos hash (opcional) para no dejar tokens visibles
          try {
            window.history.replaceState({}, document.title, window.location.pathname);
          } catch {}

          setReady(true);
          return;
        }

        // 2) Caso B: legacy token_hash
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (cancelled) return;

        if (session?.user?.id) {
          setReady(true);
          return;
        }

        if (token_hash && (type_q || "recovery")) {
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
            setReady(false);
            return;
          }

          setReady(true);
          return;
        }

        setMsg({
          type: "error",
          text: "No hay sesión de recuperación. Solicita un nuevo link de recuperación.",
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
  }, [token_hash, type_q]);

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg(null);

    if (!canSubmit) {
      setMsg({
        type: "warn",
        text: "Revisa tu contraseña: mínimo 8 caracteres, incluye letras y números, y ambas entradas deben coincidir.",
>>>>>>> preview
      });
      return;
    }

    try {
      setBusy(true);
      // eslint-disable-next-line no-console
      console.log("[ResetPassword] calling /api/auth/recovery");

<<<<<<< HEAD
      const resp = await fetch("/api/auth/recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          token_hash,
          type,
          new_password: password,
        }),
      });
=======
      const {
        data: { session },
      } = await supabase.auth.getSession();
>>>>>>> preview

      // ✅ Parse robusto (evita: Unexpected end of JSON input)
      const raw = await resp.text();
      let data = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = { raw };
      }

      setDiag({
        step: "api_response",
        status: resp.status,
        ok: resp.ok,
        data,
      });

      if (!resp.ok || !data?.ok) {
        setMsg({
          type: "error",
<<<<<<< HEAD
          text:
            data?.error ||
            `No se pudo actualizar (HTTP ${resp.status}). Genera un link nuevo e intenta otra vez.`,
=======
          text: "No hay sesión activa para cambiar la contraseña. Abre el link de recuperación nuevamente o genera uno nuevo.",
>>>>>>> preview
        });
        return;
      }

      setMsg({ type: "success", text: "✅ Contraseña actualizada. Redirigiendo a login…" });

      // Limpia URL para no dejar token expuesto
      try {
        window.history.replaceState({}, document.title, "/reset-password");
      } catch {}

<<<<<<< HEAD
      setTimeout(() => navigate("/login", { replace: true }), 900);
    } catch (e) {
      setMsg({ type: "error", text: e?.message || "Error inesperado." });
      setDiag({ step: "exception", error: e?.message || String(e) });
=======
      setMsg({ type: "success", text: "✅ Contraseña actualizada. Ya puedes iniciar sesión." });

      await supabase.auth.signOut().catch(() => {});
      setTimeout(() => navigate("/login", { replace: true }), 900);
    } catch (e2) {
      setMsg({ type: "error", text: e2?.message || "Error inesperado." });
>>>>>>> preview
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
        <p className="text-sm text-slate-600 mb-4">Ingresa una nueva contraseña para tu cuenta.</p>

        {!token_hash ? (
          <div className="space-y-3">
            <div className="text-sm text-red-600">
              Link inválido o incompleto. Genera un reset nuevo.
            </div>
            <button
              type="button"
              className="w-full bg-slate-900 text-white rounded-lg px-4 py-2 text-sm"
              onClick={() => navigate("/login", { replace: true })}
            >
              Ir a Login
            </button>
          </div>
        ) : (
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
              type="button"
              onClick={handleSave}
              disabled={busy}
              className="w-full bg-emerald-600 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-60"
            >
              {busy ? "Guardando…" : "Guardar"}
            </button>

            {/* Diagnóstico temporal (quitar cuando ya esté estable) */}
            {diag ? (
              <pre className="mt-2 text-[10px] whitespace-pre-wrap bg-slate-50 border rounded-lg p-2 text-slate-700">
                {JSON.stringify(diag, null, 2)}
              </pre>
            ) : null}

            <div className="text-[11px] text-slate-500">
              Tip: si el link expiró, genera uno nuevo.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
