// src/pages/ResetPassword.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "../components/LanguageSwitcher";

export default function ResetPassword() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [loadingInit, setLoadingInit] = useState(true);
  const [loadingAction, setLoadingAction] = useState(false);

  const [errorMsg, setErrorMsg] = useState(null);
  const [infoMsg, setInfoMsg] = useState(null);

  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const urlInfo = useMemo(() => {
    try {
      const u = new URL(window.location.href);
      const type = u.searchParams.get("type") || "";
      // Supabase puede traer "code" en query (PKCE)
      const code = u.searchParams.get("code") || "";
      const hash = window.location.hash || "";
      return { type, code, hash };
    } catch {
      return { type: "", code: "", hash: "" };
    }
  }, []);

  // 1) Al llegar desde el email: intercambiar code → sesión (si aplica)
  // Nota: Si ya vienes desde /auth/callback, normalmente ya hay sesión y esto no hace nada.
  useEffect(() => {
    let alive = true;

    const init = async () => {
      setLoadingInit(true);
      setErrorMsg(null);
      setInfoMsg(null);

      try {
        // Si viene con code (PKCE), lo intercambiamos por sesión
        if (urlInfo.code) {
          const { error: exError } = await supabase.auth.exchangeCodeForSession(
            window.location.href
          );
          if (exError) {
            console.error("[ResetPassword] exchangeCodeForSession error:", exError);
            if (!alive) return;
            setErrorMsg(
              t("resetPassword.invalidOrExpired") ||
                "El enlace de recuperación es inválido o expiró. Solicita uno nuevo."
            );
            setLoadingInit(false);
            return;
          }
        }

        // Verificar que exista sesión
        const { data: sessData, error: sessErr } = await supabase.auth.getSession();

        if (sessErr) {
          console.error("[ResetPassword] getSession error:", sessErr);
        }

        const user = sessData?.session?.user || null;

        if (!user) {
          if (!alive) return;
          setErrorMsg(
            t("resetPassword.noSession") ||
              "No hay una sesión válida para restablecer la contraseña. Vuelve a solicitar el enlace."
          );
          setLoadingInit(false);
          return;
        }

        // Opcional: si el type viene distinto, no bloqueamos (varía por proveedor/config)
        if (!alive) return;
        if (urlInfo.type && urlInfo.type !== "recovery") {
          setInfoMsg(
            t("resetPassword.noticeType") ||
              "Sesión detectada. Si este enlace no era de recuperación, vuelve a iniciar sesión normalmente."
          );
        }

        setLoadingInit(false);
      } catch (e) {
        console.error("[ResetPassword] init exception:", e);
        if (!alive) return;
        setErrorMsg(
          t("resetPassword.unexpected") ||
            "Ocurrió un error al preparar el restablecimiento de contraseña."
        );
        setLoadingInit(false);
      }
    };

    init();

    return () => {
      alive = false;
    };
  }, [t, urlInfo.code, urlInfo.type]);

  const validatePassword = () => {
    // Regla simple y universal (puedes endurecer luego)
    if (!newPassword || newPassword.length < 8) {
      return (
        t("resetPassword.passwordMin") ||
        "La contraseña debe tener al menos 8 caracteres."
      );
    }
    if (newPassword !== confirm) {
      return (
        t("resetPassword.passwordMismatch") ||
        "Las contraseñas no coinciden."
      );
    }
    return null;
  };

  // 2) Actualizar contraseña (AUTO-LOGIN)
  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);

    const err = validatePassword();
    if (err) {
      setErrorMsg(err);
      return;
    }

    try {
      setLoadingAction(true);

      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        console.error("[ResetPassword] updateUser error:", error);
        setErrorMsg(
          error.message ||
            (t("resetPassword.updateError") || "No se pudo actualizar la contraseña.")
        );
        setLoadingAction(false);
        return;
      }

      // ✅ Auto-login: NO hacemos signOut. La sesión actual queda válida.
      setInfoMsg(
        t("resetPassword.updatedOkAutoLogin") ||
          "Contraseña actualizada. Entrando a tu cuenta…"
      );

      // Limpieza visual: evita que el usuario refresquee y se confunda con parámetros viejos
      try {
        const clean = `${window.location.origin}${window.location.pathname}`;
        window.history.replaceState({}, document.title, clean);
      } catch {
        // ignore
      }

      // Redirigir al inicio (tu app redirigirá por rol si aplica)
      navigate("/inicio", { replace: true });
    } catch (e) {
      console.error("[ResetPassword] exception:", e);
      setErrorMsg(
        t("resetPassword.unexpected") ||
          "Ocurrió un error al actualizar la contraseña."
      );
    } finally {
      setLoadingAction(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <Link to="/" className="text-sm text-slate-600 hover:underline">
            {t("resetPassword.backHome") || "Volver"}
          </Link>
          <LanguageSwitcher />
        </div>

        <h1 className="text-xl font-bold text-slate-900">
          {t("resetPassword.title") || "Restablecer contraseña"}
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          {t("resetPassword.subtitle") ||
            "Crea una nueva contraseña para tu cuenta."}
        </p>

        {loadingInit ? (
          <div className="mt-6 text-sm text-slate-600">
            {t("resetPassword.loading") || "Preparando…"}
          </div>
        ) : (
          <>
            {errorMsg ? (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 whitespace-pre-line">
                {errorMsg}
              </div>
            ) : null}

            {infoMsg ? (
              <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 whitespace-pre-line">
                {infoMsg}
              </div>
            ) : null}

            <form className="mt-6 space-y-4" onSubmit={handleUpdatePassword}>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {t("resetPassword.newPassword") || "Nueva contraseña"}
                </label>
                <input
                  type="password"
                  autoComplete="new-password"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder={t("resetPassword.newPlaceholder") || "Mínimo 8 caracteres"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={loadingAction}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {t("resetPassword.confirmPassword") || "Confirmar contraseña"}
                </label>
                <input
                  type="password"
                  autoComplete="new-password"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder={t("resetPassword.confirmPlaceholder") || "Repite"}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  disabled={loadingAction}
                />
              </div>

              <button
                type="submit"
                disabled={loadingAction}
                className="w-full inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loadingAction
                  ? t("resetPassword.saving") || "Guardando…"
                  : t("resetPassword.saveButton") || "Guardar nueva contraseña"}
              </button>
            </form>

            {/* Ayuda visual si el usuario cae sin sesión */}
            {!loadingInit && errorMsg && (
              <div className="mt-4 text-[11px] text-slate-500">
                {t("resetPassword.tip") ||
                  "Tip: vuelve a /login, escribe tu correo y usa “¿Olvidaste tu contraseña?” para generar un nuevo enlace."}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
