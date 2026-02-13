// src/pages/ForgotPassword.jsx
import React, { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "../components/LanguageSwitcher";
import { supabase } from "../lib/supabaseClient";

export default function ForgotPassword() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const next = useMemo(() => searchParams.get("next") || "/inicio", [searchParams]);

  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { type, text }

  const inputClass =
    "w-full px-4 py-3 rounded-2xl bg-slate-800/70 border border-slate-700 " +
    "text-white placeholder:text-slate-400 outline-none";

  const buttonClass =
    "w-full mt-6 py-4 rounded-2xl bg-white/90 text-slate-900 font-semibold text-center " +
    "active:bg-white select-none disabled:opacity-60";

  const linkClass = "text-xs underline opacity-80 hover:opacity-100";

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg(null);

    const cleanEmail = String(email || "").trim().toLowerCase();
    if (!cleanEmail) {
      setMsg({
        type: "error",
        text: t("forgot.errorEmail", { defaultValue: "Ingresa un correo válido." }),
      });
      return;
    }

    try {
      setBusy(true);

      // ✅ IMPORTANTE en tu arquitectura:
      // El correo debe volver a /auth/callback (para setSession + bootstrap cookie),
      // y el callback enviará a /reset-password.
      const redirectTo =
        `${window.location.origin}/auth/callback?` +
        `next=${encodeURIComponent("/reset-password")}` +
        `&rp_next=${encodeURIComponent(next)}`;

      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo,
      });

      // Por seguridad Supabase puede responder "ok" aunque el email no exista.
      if (error) {
        setMsg({
          type: "error",
          text:
            error.message ||
            t("forgot.errorGeneric", { defaultValue: "No se pudo enviar el correo." }),
        });
        return;
      }

      setMsg({
        type: "success",
        text: t("forgot.success", {
          defaultValue:
            "✅ Si el correo existe, te llegará un enlace para crear una nueva contraseña. Revisa SPAM y ábrelo en el mismo navegador.",
        }),
      });

      setTimeout(() => navigate(`/login?next=${encodeURIComponent(next)}`, { replace: true }), 2500);
    } catch (e2) {
      setMsg({
        type: "error",
        text: e2?.message || t("forgot.errorGeneric", { defaultValue: "Error inesperado." }),
      });
    } finally {
      setBusy(false);
    }
  }

  const msgClass =
    msg?.type === "success"
      ? "text-emerald-200 border-emerald-400/30 bg-emerald-500/10"
      : msg?.type === "info"
      ? "text-slate-200 border-white/10 bg-white/5"
      : "text-red-200 border-red-400/30 bg-red-500/10";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center px-4">
      <div className="w-full max-w-xl">
        <div className="flex items-center justify-between mb-4 px-1">
          <Link to={`/login?next=${encodeURIComponent(next)}`} className={linkClass}>
            {t("forgot.back", { defaultValue: "Volver a Login" })}
          </Link>
          <LanguageSwitcher />
        </div>

        <div className="bg-slate-900/70 p-10 rounded-[2.25rem] border border-slate-800 shadow-2xl">
          <h1 className="text-2xl font-semibold mb-2">
            {t("forgot.title", { defaultValue: "Restablecer contraseña" })}
          </h1>
          <p className="text-sm text-slate-300/80 mb-6">
            {t("forgot.subtitle", {
              defaultValue:
                "Te enviaremos un enlace para crear una nueva contraseña. Si no te llega, revisa SPAM.",
            })}
          </p>

          {msg ? (
            <div className={`mb-6 text-xs p-4 rounded-2xl border ${msgClass}`}>{msg.text}</div>
          ) : (
            <div className="mb-6 text-xs p-4 rounded-2xl border border-white/10 bg-white/5 text-slate-100">
              {t("forgot.tip", {
                defaultValue:
                  "Tip: si el enlace falla, genera uno nuevo y ábrelo en una ventana de incógnito.",
              })}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <label className="block mb-2 text-sm">
              {t("forgot.email", { defaultValue: "Correo" })}
            </label>
            <input
              className={inputClass}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("forgot.emailPh", { defaultValue: "tu@correo.com" })}
              required
            />

            <button type="submit" className={buttonClass} disabled={busy}>
              {busy
                ? t("forgot.sending", { defaultValue: "Enviando…" })
                : t("forgot.send", { defaultValue: "Enviar enlace" })}
            </button>
          </form>

          <div className="mt-6 text-xs bg-black/30 border border-white/10 rounded-2xl p-4">
            <div className="opacity-90">{t("forgot.noteTitle", { defaultValue: "Nota" })}</div>
            <div className="opacity-80">
              {t("forgot.noteDesc", {
                defaultValue:
                  "El enlace entrará por /auth/callback y te enviará a /reset-password para crear la nueva contraseña.",
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
