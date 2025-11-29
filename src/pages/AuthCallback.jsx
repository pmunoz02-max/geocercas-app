// src/pages/AuthCallback.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

export default function AuthCallback() {
  const navigate = useNavigate();
  const [status, setStatus] = useState({
    state: "loading",
    message: "Procesando enlace de acceso...",
  });

  useEffect(() => {
    const run = async () => {
      try {
        // 1) Leemos el hash de la URL (lo que viene después de #)
        const rawHash = window.location.hash || "";
        const hash = rawHash.startsWith("#") ? rawHash.slice(1) : rawHash;
        const hashParams = new URLSearchParams(hash);

        const error = hashParams.get("error");
        const errorCode = hashParams.get("error_code");
        const errorDescription = hashParams.get("error_description");

        if (error || errorCode) {
          setStatus({
            state: "error",
            message:
              decodeURIComponent(errorDescription || errorCode || error) ||
              "El enlace de acceso no es válido o ha expirado.",
          });
          return;
        }

        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");

        // 2) Caso Magic Link clásico: access_token + refresh_token en el hash
        if (accessToken && refreshToken) {
          const { error: setSessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (setSessionError) {
            console.error("[AuthCallback] setSession error:", setSessionError);
            setStatus({
              state: "error",
              message:
                setSessionError.message ||
                "No se pudo establecer la sesión desde el enlace.",
            });
            return;
          }

          // Limpiamos el hash de la URL
          window.history.replaceState({}, document.title, window.location.pathname);

          setStatus({
            state: "success",
            message: "Sesión iniciada correctamente. Redirigiendo…",
          });

          // Pequeño delay para mostrar el mensaje y luego vamos a /inicio
          setTimeout(() => {
            navigate("/inicio", { replace: true });
          }, 500);

          return;
        }

        // 3) Caso PKCE (código en query string, por si en algún momento lo usas)
        const searchParams = new URLSearchParams(window.location.search);
        const code = searchParams.get("code");

        if (code) {
          const { error: exchangeError } =
            await supabase.auth.exchangeCodeForSession(code);

          if (exchangeError) {
            console.error(
              "[AuthCallback] exchangeCodeForSession error:",
              exchangeError
            );
            setStatus({
              state: "error",
              message:
                exchangeError.message ||
                "No se pudo completar el inicio de sesión con este enlace.",
            });
            return;
          }

          // Limpiamos querystring
          window.history.replaceState({}, document.title, window.location.pathname);

          setStatus({
            state: "success",
            message: "Sesión iniciada correctamente. Redirigiendo…",
          });

          setTimeout(() => {
            navigate("/inicio", { replace: true });
          }, 500);

          return;
        }

        // 4) Si llegamos aquí, el enlace no trae info útil
        setStatus({
          state: "error",
          message:
            "El enlace de acceso es inválido o está incompleto. Solicita uno nuevo.",
        });
      } catch (e) {
        console.error("[AuthCallback] error inesperado:", e);
        setStatus({
          state: "error",
          message:
            "Ocurrió un error inesperado al procesar el enlace. Intenta de nuevo.",
        });
      }
    };

    run();
  }, [navigate]);

  const isLoading = status.state === "loading";
  const isError = status.state === "error";

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900">
      <div className="w-full max-w-md rounded-2xl bg-slate-800/90 border border-slate-700 px-6 py-5 text-center shadow-xl">
        <h1 className="text-lg font-semibold text-white mb-3">
          App Geocercas
        </h1>

        <p
          className={`text-sm ${
            isError ? "text-red-300" : "text-slate-100"
          } mb-4`}
        >
          {status.message}
        </p>

        {isLoading && (
          <div className="text-xs text-slate-400">
            Por favor espera unos segundos…
          </div>
        )}

        {isError && (
          <button
            onClick={() => navigate("/login", { replace: true })}
            className="mt-3 inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-lg bg-emerald-500 text-white hover:bg-emerald-600"
          >
            Volver al inicio de sesión
          </button>
        )}
      </div>
    </div>
  );
}
