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

  // 0) Procesar MAGIC LINK que llega directamente a /login#...
  //    - Si hay error en el hash => mostrarlo y limpiar URL
  //    - Si hay access_token + refresh_token => setSession y navegar a /inicio
  useEffect(() => {
    const rawHash = location.hash || "";
    const hash = rawHash.startsWith("#") ? rawHash.slice(1) : rawHash;
    if (!hash) return;

    const params = new URLSearchParams(hash);
    const error = params.get("error") || params.get("error_code");
    const errorDescription = params.get("error_description");

    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");

    // Caso 1: error en el link (otp_expired, access_denied, etc.)
    if (error) {
      const msg =
        decodeURIComponent(errorDescription || error) ||
        "El enlace de acceso no es válido o ha expirado.";
      setErrorMsg(msg);
      // Limpiamos el hash para que no estorbe más
      window.history.replaceState({}, document.title, "/login");
      return;
    }

    // Caso 2: tenemos tokens => iniciar sesión desde aquí mismo
    if (accessToken && refreshToken) {
      (async () => {
        try {
          const { error: setSessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (setSessionError) {
            console.error("[Login] setSession error:", setSessionError);
            setErrorMsg(
              setSessionError.message ||
                "No se pudo confirmar la sesión desde el enlace."
            );
          } else {
            // Limpiamos el hash y vamos al panel
            window.history.replaceState({}, document.title, "/login");
            navigate("/inicio", { replace: true });
          }
        } catch (e: any) {
          console.error("[Login] excepción en setSession:", e);
          setErrorMsg(
            e?.message ||
              "Ocurrió un error al procesar el enlace de acceso."
          );
          window.history.replaceState({}, document.title, "/login");
        }
      })();
    }
  }, [location.hash, navigate]);

  // 1) Si la URL es /login?mode=magic => abrir pestaña Magic Link
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const urlMode = params.get("mode");
    if (urlMode === "magic") {
      setMode("magic");
    }
  }, [location.search]);

  // 2) Si YA hay sesión (por cualquier vía), enviamos a /inicio
  useEffect(() => {
    if (!loading && session) {
      navigate("/inicio", { replace: true });
    }
  }, [session, loading, navigate]);

  // 3) Login con email + contraseña
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

      // Redirección inmediata; AuthContext se actualizará en paralelo
      navigate("/inicio", { replace: true });
    } catch (err: any) {
      console.error("[Login] signInWithPassword exception:", err);
      setErrorMsg("Ocurrió un error inesperado. Intenta nuevamente.");
    } finally {
      setLoadingAction(false);
    }
  };

  // 4) Enviar Magic Link clásico (para owners/admins)
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

      // Enviamos a /login por compatibilidad, ya que ahora lo sabemos procesar
      const redirectTo = `${window.location.origin}/login`;

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
      setErrorMsg("Ocurrió un error inesperado al enviar el Magic Link.");
    } finally {
      setLoadingAction(false);
    }
  };

  // Mientras AuthContext resuelve la sesión inicial, no mostramos nada
  if (loading) return null;

  // Si ya hay sesión (porque se procesó un Magic Link o login previo), no mostramos el formulario
  if (session) return null;

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

        {/* Toggle de modo */}
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

        {/* Mensajes */}
        {errorMsg && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 whitespace-pre-line">
            {errorMsg}
          </div>
        )}
        {infoMsg && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            {infoMsg}
          </div>
        )}

        {/* Formulario password */}
        {isPasswordMode && (
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
              className="w-full inline-flex items-center justify-center px-4 py-2.5 rounded-md text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loadingAction ? "Ingresando..." : "Iniciar sesión"}
            </button>
          </form>
        )}

        {/* Formulario Magic Link */}
        {!isPasswordMode && (
          <form onSubmit={handleSubmitMagic} className="space-y-3">
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
            <button
              type="submit"
              disabled={loadingAction}
              className="w-full inline-flex items-center justify-center px-4 py-2.5 rounded-md text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loadingAction ? "Enviando link..." : "Enviar Magic Link"}
            </button>
            <p className="text-[11px] text-slate-500">
              Te enviaremos un correo con un link de acceso. Al hacer clic, se
              abrirá esta misma página y te conectaremos automáticamente.
            </p>
          </form>
        )}
      </div>
    </div>
  );
};

export default Login;
