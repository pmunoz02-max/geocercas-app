// src/pages/Login.tsx
import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { useAuth } from "../context/AuthContext.jsx";

type Mode = "password" | "magic";

const Login: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { session, loading } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<Mode>("password");

  const [loadingAction, setLoadingAction] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  //
  // ⭐ LIMPIAR ERROR DE HASH (otp_expired, invalid, etc)
  //
  useEffect(() => {
    if (location.hash.includes("error")) {
      // No bloqueamos nada, solo limpiamos el hash
      window.history.replaceState({}, document.title, "/login");
    }
  }, [location.hash]);

  //
  // Si la URL es /login?mode=magic
  //
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const urlMode = params.get("mode");
    if (urlMode === "magic") {
      setMode("magic");
    }
  }, [location.search]);

  //
  // SI YA HAY SESIÓN → LLEVAR SIEMPRE A /inicio
  //
  useEffect(() => {
    if (!loading && session) {
      navigate("/inicio", { replace: true });
    }
  }, [session, loading, navigate]);

  //
  // LOGIN NORMAL CON CONTRASEÑA
  //
  const handleSubmitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);

    if (!email || !password) {
      setErrorMsg("Por favor ingresa correo y contraseña.");
      return;
    }

    try {
      setLoadingAction(true);
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error("[Login] signInWithPassword error:", error);
        setErrorMsg(error.message || "Credenciales inválidas.");
        return;
      }

      //
      // ⭐ REDIRECCIÓN INMEDIATA SIN ESPERAR AL AUTHCONTEXT
      //
      navigate("/inicio", { replace: true });
    } catch (err: any) {
      console.error("[Login] signInWithPassword exception:", err);
      setErrorMsg("Ocurrió un error inesperado. Intenta nuevamente.");
    } finally {
      setLoadingAction(false);
    }
  };

  //
  // MAGIC LINK LOGIN NORMAL
  //
  const handleSubmitMagic = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);

    if (!email) {
      setErrorMsg("Por favor ingresa tu correo electrónico.");
      return;
    }

    try {
      setLoadingAction(true);

      const redirectTo = `${window.location.origin}/auth/callback`;

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo },
      });

      if (error) {
        console.error("[Login] signInWithOtp error:", error);
        setErrorMsg(error.message || "No se pudo enviar el Magic Link.");
        return;
      }

      setInfoMsg(
        "Te enviamos un link de acceso. Revisa tu bandeja de entrada (y spam)."
      );
    } catch (err: any) {
      console.error("[Login] signInWithOtp exception:", err);
      setErrorMsg("Ocurrió un error inesperado.");
    } finally {
      setLoadingAction(false);
    }
  };

  //
  // SI AuthContext todavía no sabe si hay sesión, no parpadeamos
  //
  if (loading) return null;

  //
  // SI YA HAY SESIÓN → NO MOSTRAR FORMULARIO
  //
  if (session) return null;

  // ---------------- UI -----------------

  const isPasswordMode = mode === "password";

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-5">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-900">
            Iniciar sesión
          </h1>
          <p className="text-sm text-slate-600">
            Accede a tu panel de App Geocercas para gestionar geocercas,
            personal, actividades y reportes.
          </p>
        </div>

        {/* Tabs modo */}
        <div className="inline-flex items-center rounded-full bg-slate-100 p-1 text-xs font-medium">
          <button
            type="button"
            onClick={() => setMode("password")}
            className={`flex-1 px-3 py-1.5 rounded-full transition-colors ${
              isPasswordMode
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            Email + contraseña
          </button>
          <button
            type="button"
            onClick={() => setMode("magic")}
            className={`flex-1 px-3 py-1.5 rounded-full transition-colors ${
              !isPasswordMode
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            Magic Link por correo
          </button>
        </div>

        {errorMsg && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {errorMsg}
          </div>
        )}
        {infoMsg && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            {infoMsg}
          </div>
        )}

        {isPasswordMode ? (
          <form onSubmit={handleSubmitPassword} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Correo electrónico
              </label>
              <input
                type="email"
                autoComplete="email"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="tucorreo@ejemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loadingAction}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Contraseña
              </label>
              <input
                type="password"
                autoComplete="current-password"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loadingAction}
              />
            </div>
            <button
              type="submit"
              disabled={loadingAction}
              className="w-full inline-flex items-center justify-center px-4 py-2.5 rounded-md text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-500"
            >
              {loadingAction ? "Ingresando..." : "Iniciar sesión"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmitMagic} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Correo electrónico
              </label>
              <input
                type="email"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loadingAction}
              />
            </div>
            <button
              type="submit"
              disabled={loadingAction}
              className="w-full inline-flex items-center justify-center px-4 py-2.5 rounded-md text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-500"
            >
              {loadingAction ? "Enviando link..." : "Enviar Magic Link"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default Login;
