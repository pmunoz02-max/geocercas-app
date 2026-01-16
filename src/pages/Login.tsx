// LOGIN-V31 (NO-JS) – WebView/TWA definitivo: submit nativo a /api/auth/password
import React, { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "../components/LanguageSwitcher";

export default function Login() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const next = useMemo(() => searchParams.get("next") || "/inicio", [searchParams]);

  // Solo para UX (no depende de eventos para autenticación)
  const [email, setEmail] = useState("pruebatugeo@gmail.com");
  const [password, setPassword] = useState("");

  const inputClass =
    "w-full px-4 py-3 rounded-2xl bg-slate-800/70 border border-slate-700 " +
    "text-white placeholder:text-slate-400 outline-none";

  const buttonClass =
    "w-full mt-8 py-4 rounded-2xl bg-white/90 text-slate-900 font-semibold text-center " +
    "active:bg-white select-none";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center px-4">
      <div className="w-full max-w-xl">
        {/* Header público: idioma + volver */}
        <div className="flex items-center justify-between mb-4 px-1">
          <Link to="/" className="text-xs sm:text-sm underline opacity-80">
            {t("login.back", { defaultValue: "Volver" })}
          </Link>
          <LanguageSwitcher />
        </div>

        <div className="bg-slate-900/70 p-10 rounded-[2.25rem] border border-slate-800 shadow-2xl">
          <h1 className="text-3xl font-semibold mb-6">
            {t("login.title", { defaultValue: "Entrar" })}{" "}
            <span className="text-xs opacity-60">
              {t("login.badge", { defaultValue: "(LOGIN-V31 NO-JS)" })}
            </span>
          </h1>

          <div className="mb-6 text-xs p-4 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 text-emerald-100">
            {t("login.info", {
              defaultValue:
                "Login estable en WebView/TWA: envío nativo (sin eventos JS), anti rate-limit por diseño.",
            })}
          </div>

          {/* ✅ FORM NATIVO (NO depende de onClick/onBlur/onSubmit JS) */}
          <form method="POST" action="/api/auth/password">
            <input type="hidden" name="next" value={next} />

            <label className="block mb-2 text-sm">
              {t("login.email", { defaultValue: "Correo" })}
            </label>
            <input
              className={inputClass}
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)} // solo UX
              required
            />

            <div className="h-6" />

            <label className="block mb-2 text-sm">
              {t("login.password", { defaultValue: "Contraseña" })}
            </label>
            <input
              className={inputClass}
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)} // solo UX
              required
            />

            <button type="submit" className={buttonClass}>
              {t("login.submit", { defaultValue: "Entrar" })}
            </button>
          </form>

          <div className="mt-6 text-xs bg-black/30 border border-white/10 rounded-2xl p-4">
            <div>{t("login.modeTitle", { defaultValue: "Modo: NO-JS (form submit nativo)" })}</div>
            <div>
              {t("login.modeDesc", {
                defaultValue: "Si el login es correcto, el servidor redirige a /auth/callback con tokens.",
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
