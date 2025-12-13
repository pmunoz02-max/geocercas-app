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
      // Supabase puede traer "code" en query o tokens en hash según configuración/histórico
      const code = u.searchParams.get("code") || "";
      const hash = window.location.hash || "";
      return { type, code, hash };
    } catch {
      return { type: "", code: "", hash: "" };
    }
  }, []);

  // 1) Al llegar desde el email: intercambiar code → sesión
  useEffect(() => {
    let alive = true;

    const init = async () => {
      setLoadingInit(true);
      setErrorMsg(null);
      setInfoMsg(null);

      try {
        // Si viene con code (PKCE), lo intercambiamos por sesión
        // Esto es el equivalente al AuthCallback, pero para recovery.
        if (urlInfo.code) {
          const { error: exError } = await supabase.auth.exchangeCodeForSession(
            window.location.href
          );
          if (exError) {
            console.error(
              "[ResetPassword] exchangeCodeForSession error:",
              exError
            );
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
        const { data: sessData, error: sessErr } =
          await supabase.auth.getSession();

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
        // Pero podemos mostrar nota si no es "recovery".
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

  // 2) Actualizar contraseña
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
            (t("resetPassword.updateFailed") ||
              "No se pudo actualizar la contraseña. Intenta nuevamente.")
        );
        return;
      }

      setInfoMsg(
        t("resetPassword.success") ||
          "Contraseña actualizada correctamente. Ahora puedes iniciar sesión."
      );

      // Por seguridad, cerramos sesión y mandamos al login
      await supabase.auth.signOut();
      navigate("/login", { replace: true });
    } catch (e) {
      console.error("[ResetPassword] exception:", e);
      setErrorMsg(
        t("resetPassword.updateUnexpected") ||
          "Error inesperado al actualizar la contraseña."
      );
    } finally {
      setLoadingAction(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-slate-900">
              {t("resetPassword.title") || "Restablecer contraseña"}
            </h1>
            <p className="text-sm text-slate-600">
              {t("resetPassword.subtitle") ||
                "Crea una nueva contraseña para tu cuenta."}
            </p>
          </div>
          <LanguageSwitcher />
        </div>

        {loadingInit && (
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
            {t("resetPassword.loading") || "Preparando enlace de recuperación…"}
          </div>
        )}

        {errorMsg && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 whitespace-pre-line">
            {errorMsg}
          </div>
        )}

        {infoMsg && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 whitespace-pre-line">
            {infoMsg}
          </div>
        )}

        {/* Form solo si ya estamos listos y no hay error fatal */}
        {!loadingInit && !errorMsg && (
          <form onSubmit={handleUpdatePassword} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {t("resetPassword.newPassword") || "Nueva contraseña"}
              </label>
              <input
                type="password"
                autoComplete="new-password"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder={
                  t("resetPassword.newPasswordPlaceholder") ||
                  "Mínimo 8 caracteres"
                }
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
              className="w-full inline-flex items-center justify-center px-4 py-2.5 rounded-md text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loadingAction
                ? t("resetPassword.saving") || "Guardando…"
                : t("resetPassword.saveButton") || "Guardar nueva contraseña"}
            </button>
          </form>
        )}

        <div className="pt-2 flex items-center justify-between text-xs">
          <Link
            to="/login"
            className="text-slate-600 hover:text-slate-900 hover:underline"
          >
            {t("resetPassword.backToLogin") || "Volver a iniciar sesión"}
          </Link>

          <button
            type="button"
            onClick={() => navigate("/", { replace: true })}
            className="text-slate-500 hover:text-slate-800 hover:underline"
          >
            {t("resetPassword.backHome") || "Ir a la landing"}
          </button>
        </div>

        {/* Ayuda visual si el usuario cae sin sesión */}
        {!loadingInit && errorMsg && (
          <div className="text-[11px] text-slate-500">
            {t("resetPassword.tip") ||
              "Tip: vuelve a /login, escribe tu correo y usa “¿Olvidaste tu contraseña?” para generar un nuevo enlace."}
          </div>
        )}
      </div>
    </div>
  );
}
