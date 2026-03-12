// src/pages/SignUp.tsx
import { FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../supabaseClient";
import { Link } from "react-router-dom";

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
    <div className="max-w-md mx-auto p-6">
      <h1 className="text-2xl font-bold mb-1">{t("auth.signup.title")}</h1>
      <p className="text-sm text-gray-600 mb-6">
        {t("auth.signup.subtitle")}
      </p>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">{t("auth.signup.labels.fullName")}</label>
          <input
            type="text"
            className="w-full border rounded px-3 py-2"
            placeholder={t("auth.signup.placeholders.fullName")}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            autoComplete="name"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">{t("auth.signup.labels.email")}</label>
          <input
            type="email"
            className="w-full border rounded px-3 py-2"
            placeholder={t("auth.signup.placeholders.email")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </div>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={accept}
            onChange={(e) => setAccept(e.target.checked)}
          />
          <span>
            {t("auth.signup.terms.acceptance")} {" "}
            <a href="/terms" className="underline" onClick={(e) => e.stopPropagation()}>
              {t("auth.signup.terms.terms")}
            </a>{" "}
            {t("auth.signup.terms.and")} {" "}
            <a href="/privacy" className="underline" onClick={(e) => e.stopPropagation()}>
              {t("auth.signup.terms.privacy")}
            </a>
            .
          </span>
        </label>

        <button
          type="submit"
          className="w-full px-4 py-2 rounded bg-black text-white disabled:opacity-50"
          disabled={!canSubmit}
        >
            {sending ? t("auth.signup.buttons.creating") : t("auth.signup.buttons.create")}
        </button>

        <div className="relative my-2">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white px-2 text-gray-500">{t("auth.signup.separator")}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={signUpWithGoogle}
          className="w-full px-4 py-2 rounded border disabled:opacity-50"
          disabled={sending}
            title={t("auth.signup.oauthGoogle")}
        >
          Continuar con Google
        </button>

        {msg && <p className="text-sm text-gray-700">{msg}</p>}

        <p className="text-sm text-gray-600">
          {t("auth.signup.alreadyHaveAccount")} {" "}
          <Link to="/login" className="underline">
            {t("auth.signup.loginLink")}
          </Link>
        </p>
      </form>
    </div>
  );
}
