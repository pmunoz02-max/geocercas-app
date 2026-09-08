// src/pages/SignUp.tsx

import { FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../supabaseClient";
import { Link } from "react-router-dom";
import LanguageSwitcher from "../components/LanguageSwitcher";
// Detecta si Google está habilitado por variable de entorno (solo si === "true")
const googleEnabled = import.meta.env.VITE_AUTH_GOOGLE_ENABLED === "true";

export default function SignUp() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [accept, setAccept] = useState(false);
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const redirectTo = `${window.location.origin}/auth/callback`;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const target = email.trim();

    if (!target) {
      setMsg(t("auth.signup.errors.invalidEmail"));
      return;
    }
    if (!accept) {
      setMsg(t("auth.signup.errors.mustAcceptTerms"));
      return;
    }

    setSending(true);
    setMsg(null);
    try {
      // Usamos Magic Link. Si el usuario no existe, se crea cuando confirma el link.
      const { error } = await supabase.auth.signInWithOtp({
        email: target,
        options: {
          emailRedirectTo: redirectTo,
          // Guardamos el nombre en user_metadata para que esté disponible tras confirmar
          data: fullName ? { full_name: fullName } : undefined,
        },
      });

      if (error) {
        setMsg(t("auth.signup.errors.sendFailed", { message: error.message }));
      } else {
        setMsg(t("auth.signup.messages.magicLinkSent"));
      }
    } catch (e: any) {
      setMsg(e?.message ? t("auth.signup.errors.unknown", { message: e.message }) : t("auth.signup.errors.unknown"));
    } finally {
      setSending(false);
    }
  };

  const signUpWithGoogle = async () => {
    setSending(true);
    setMsg(null);
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          // Si quieres forzar consentimiento cada vez:
          // queryParams: { prompt: "consent" }
        },
      });
      if (error) {
        setMsg(t("auth.signup.errors.googleFailed", { message: error.message }));
      } else if (!data?.url) {
        setMsg(t("auth.signup.errors.googleNoUrl"));
      } else {
        // Redirige al flujo de Google
        window.location.href = data.url;
      }
    } catch (e: any) {
      setMsg(e?.message ? t("auth.signup.errors.googleUnknown", { message: e.message }) : t("auth.signup.errors.googleUnknown"));
    } finally {
      setSending(false);
    }
  };

  const canSubmit = email.trim().length > 3 && accept && !sending;

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">
      <div className="mx-auto max-w-md">
        <div className="mb-4 flex justify-end">
          <LanguageSwitcher />
        </div>

        <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 shadow-2xl shadow-slate-950/40 backdrop-blur-sm">
          <div className="mb-6 text-left">
            <div className="text-lg font-black tracking-tight text-white">GeoField GPS</div>
          </div>

          <h1 className="mb-2 text-3xl font-bold tracking-tight text-white">{t("auth.signup.title")}</h1>
          <p className="mb-6 text-sm text-slate-300">
            {googleEnabled
              ? t("auth.signup.subtitle")
              : t("auth.signup.subtitle")}
          </p>

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-200">{t("auth.signup.labels.fullName")}</label>
              <input
                type="text"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-50 placeholder-slate-400 outline-none transition focus:border-sky-500"
                placeholder={t("auth.signup.placeholders.fullName")}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoComplete="name"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-200">{t("auth.signup.labels.email")}</label>
              <input
                type="email"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-50 placeholder-slate-400 outline-none transition focus:border-sky-500"
                placeholder={t("auth.signup.placeholders.email")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>

            <label className="flex items-start gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-sky-500"
                checked={accept}
                onChange={(e) => setAccept(e.target.checked)}
              />
              <span>
                {t("auth.signup.terms.acceptance")} {" "}
                <a href="/terms" className="underline text-sky-300" onClick={(e) => e.stopPropagation()}>
                  {t("auth.signup.terms.terms")}
                </a>{" "}
                {t("auth.signup.terms.and")} {" "}
                <a href="/privacy" className="underline text-sky-300" onClick={(e) => e.stopPropagation()}>
                  {t("auth.signup.terms.privacy")}
                </a>
                .
              </span>
            </label>

            <button
              type="submit"
              className="w-full rounded-2xl bg-sky-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-900/30 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-200 disabled:shadow-none"
              disabled={!canSubmit}
            >
              {sending ? t("auth.signup.buttons.creating") : t("auth.signup.buttons.create")}
            </button>

            {googleEnabled && (
              <div className="relative my-2">
                <div className="pointer-events-none absolute inset-0 flex items-center">
                  <span className="w-full border-t border-slate-700" />
                </div>
                <div className="relative flex justify-center text-xs uppercase tracking-[0.2em] text-slate-400">
                  <span className="bg-slate-900 px-2">{t("auth.signup.separator")}</span>
                </div>
              </div>
            )}

            {googleEnabled && (
              <button
                type="button"
                onClick={signUpWithGoogle}
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm font-medium text-slate-100 transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={sending}
                title={t("auth.signup.oauthGoogle")}
              >
                Continuar con Google
              </button>
            )}

            {msg && <p className="text-sm text-slate-200">{msg}</p>}

            <p className="text-sm text-slate-300">
              {t("auth.signup.alreadyHaveAccount")} {" "}
              <Link to="/login" className="font-medium text-sky-300 underline">
                {t("auth.signup.loginLink")}
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
