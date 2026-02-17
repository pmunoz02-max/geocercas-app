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
        // ✅ defaultValue en EN (nunca ES)
        text: t("forgot.errorEmail", { defaultValue: "Enter a valid email." }),
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
            t("forgot.errorGeneric", { defaultValue: "Could not send the email." }),
        });
        return;
      }

      setMsg({
        type: "success",
        text: t("forgot.success", {
          defaultValue:
            "✅ If the email exists, you will receive a link to create a new password. Check SPAM and open it in the same browser.",
        }),
      });

      setTimeout(() => navigate(`/login?next=${encodeURIComponent(next)}`, { replace: true }), 2500);
    } catch (e2) {
      setMsg({
        type: "error",
        text: e2?.message || t("forgot.errorGeneric", { defaultValue: "Unexpected error." }),
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
            {t("forgot.back", { defaultValue: "Back to Login" })}
          </Link>
          <LanguageSwitcher />
        </div>

        <div className="bg-slate-900/70 p-10 rounded-[2.25rem] border border-slate-800 shadow-2xl">
          <h1 className="text-2xl font-semibold mb-2">
            {t("forgot.title", { defaultValue: "Reset password" })}
          </h1>
          <p className="text-sm text-slate-300/80 mb-6">
            {t("forgot.subtitle", {
              defaultValue:
                "We will send you a link to create a new password. If it doesn't arrive, check SPAM.",
            })}
          </p>

          {msg ? (
            <div className={`mb-6 text-xs p-4 rounded-2xl border ${msgClass}`}>{msg.text}</div>
          ) : (
            <div className="mb-6 text-xs p-4 rounded-2xl border border-white/10 bg-white/5 text-slate-100">
              {t("forgot.tip", {
                defaultValue:
                  "Tip: if the link fails, generate a new one and open it in an incognito window.",
              })}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <label className="block mb-2 text-sm">
              {t("forgot.email", { defaultValue: "Email" })}
            </label>
            <input
              className={inputClass}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("forgot.emailPh", { defaultValue: "you@email.com" })}
              required
            />

            <button type="submit" className={buttonClass} disabled={busy}>
              {busy
                ? t("forgot.sending", { defaultValue: "Sending…" })
                : t("forgot.send", { defaultValue: "Send link" })}
            </button>
          </form>

          <div className="mt-6 text-xs bg-black/30 border border-white/10 rounded-2xl p-4">
            <div className="opacity-90">{t("forgot.noteTitle", { defaultValue: "Note" })}</div>
            <div className="opacity-80">
              {t("forgot.noteDesc", {
                defaultValue:
                  "The link will go through /auth/callback and then redirect you to /reset-password to set the new password.",
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
