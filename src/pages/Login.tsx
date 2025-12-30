// src/pages/Login.tsx
import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { useAuth } from "../context/AuthContext.jsx";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "../components/LanguageSwitcher";

type Mode = "password" | "magic";

const Login: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { session, loading } = useAuth();
  const { t } = useTranslation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<Mode>("password");

  const [loadingAction, setLoadingAction] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  /* ---------------------------------------------------------
   * 1) Si el usuario entra MANUALMENTE a /login
   *    y ya hay sesión válida → ir al panel.
   *    (NO aplica a Magic Link)
   * --------------------------------------------------------- */
  useEffect(() => {
    if (loading) return;
    if (session?.user) {
      navigate("/inicio", { replace: true });
    }
  }, [session, loading, navigate]);

  /* ---------------------------------------------------------
   * 2) Reset mensajes al cambiar de URL
   * --------------------------------------------------------- */
  useEffect(() => {
    setErrorMsg(null);
    setInfoMsg(null);
  }, [location.key]);

  /* ---------------------------------------------------------
   * 3) Modo desde querystring (?mode=magic)
   * --------------------------------------------------------- */
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const urlMode = params.get("mode");
    if (urlMode === "magic") setMode("magic");
    else if (urlMode === "password") setMode("password");
  }, [location.search]);

  /* ---------------------------------------------------------
   * 4) Errores devueltos por Supabase en hash
   * --------------------------------------------------------- */
  useEffect(() => {
    const hash = location.hash || "";
    if (!hash.startsWith("#")) return;

    const raw = hash.slice(1);
    const params = new URLSearchParams(raw);
    const error = params.get("error");
    const errorCode = params.get("error_code");
    const errorDesc = params.get("error_description");

    if (!error && !errorCode && !errorDesc) return;

    let friendly =
      t("login.errorMagicLink") || "No se pudo procesar el enlace mágico.";

    if ((errorCode || "").toLowerCase().includes("otp_expired")) {
      friendly =
        t("login.magicExpired") ||
        "El enlace mágico expiró o ya fue usado. Solicita uno nuevo.";
    }

    if (errorDesc) friendly += `\n${decodeURIComponent(errorDesc)}`;

    setErrorMsg(friendly);
    setMode("magic");
  }, [location.hash, t]);

  /* ---------------------------------------------------------
   * LOGIN CON CONTRASEÑA
   * --------------------------------------------------------- */
  const handleSubmitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);

    if (!email || !password) {
      setErrorMsg(t("login.errorMissingCredentials") || "Faltan credenciales.");
      return;
    }

    try {
      setLoadingAction(true);

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setErrorMsg(error.message || "Credenciales inválidas.");
        return;
      }

      navigate("/inicio", { replace: true });
    } catch (err: any) {
      setErrorMsg("Error inesperado al iniciar sesión.");
    } finally {
      setLoadingAction(false);
    }
  };

  /* ---------------------------------------------------------
   * LOGIN CON MAGIC LINK (solo envía correo)
   * --------------------------------------------------------- */
  const handleSubmitMagic = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);

    if (!email) {
      setErrorMsg(t("login.errorMissingEmail") || "Debes ingresar un correo.");
      return;
    }

    try {
      setLoadingAction(true);
      const redirectTo = `${window.location.origin}/auth/callback?target=panel`;

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo },
      });

      if (error) {
        setErrorMsg(error.message || "No se pudo enviar el enlace mágico.");
        return;
      }

      setInfoMsg(
        t("login.infoMagicLinkSent") ||
          "Te enviamos un enlace mágico a tu correo."
      );
    } catch {
      setErrorMsg("Error inesperado al enviar el enlace mágico.");
    } finally {
      setLoadingAction(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        Cargando…
      </div>
    );
  }

  /* ---------------------------------------------------------
   * UI (idéntica a la tuya, sin cambios funcionales)
   * --------------------------------------------------------- */
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white border rounded-2xl p-6 space-y-5">
        <div className="flex justify-between">
          <h1 className="text-2xl font-semibold">
            {t("login.title") || "Iniciar sesión"}
          </h1>
          <LanguageSwitcher />
        </div>

        {errorMsg && (
          <div className="border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {errorMsg}
          </div>
        )}

        {infoMsg && (
          <div className="border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
            {infoMsg}
          </div>
        )}

        {mode === "password" ? (
          <form onSubmit={handleSubmitPassword} className="space-y-4">
            <input
              type="email"
              placeholder="Correo"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border rounded p-2"
            />
            <input
              type="password"
              placeholder="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border rounded p-2"
            />
            <button className="w-full bg-sky-500 text-white rounded p-2">
              Entrar
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmitMagic} className="space-y-4">
            <input
              type="email"
              placeholder="Correo"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border rounded p-2"
            />
            <button className="w-full bg-sky-100 border rounded p-2">
              Enviar link mágico
            </button>
          </form>
        )}

        <div className="flex gap-2">
          <button onClick={() => setMode("password")} className="text-sm underline">
            Contraseña
          </button>
          <button onClick={() => setMode("magic")} className="text-sm underline">
            Link mágico
          </button>
        </div>
      </div>
    </div>
  );
};

export default Login;
