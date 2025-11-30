// src/pages/AuthCallback.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

type StatusState = "loading" | "error" | "success";

export default function AuthCallback() {
  const [status, setStatus] = useState<StatusState>("loading");
  const [message, setMessage] = useState("Procesando enlace de acceso…");
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;

    const run = async () => {
      try {
        const url = new URL(window.location.href);

        // ----------------------------------------
        // 1) Intentar flujo antiguo: tokens en el hash (#)
        // ----------------------------------------
        const rawHash = url.hash || "";
        const hash = rawHash.startsWith("#") ? rawHash.slice(1) : rawHash;
        const hashParams = new URLSearchParams(hash);

        const error = hashParams.get("error");
        const errorCode = hashParams.get("error_code");
        const errorDescription = hashParams.get("error_description");

        if (error || errorCode) {
          if (!active) return;
          setStatus("error");
          setMessage(
            decodeURIComponent(errorDescription || errorCode || error || "") ||
              "El enlace de acceso no es válido o ha expirado."
          );
          return;
        }

        let sessionError: any = null;

        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");

        if (accessToken && refreshToken) {
          // 🔹 Flujo hash antiguo
          const { error: setSessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          sessionError = setSessionError;
        } else {
          // 🔹 Flujo moderno: código en query → exchangeCodeForSession
          const { error } = await supabase.auth.exchangeCodeForSession(
            window.location.href
          );
          sessionError = error;
        }

        if (!active) return;

        if (sessionError) {
          console.error("[AuthCallback] error de sesión:", sessionError);
          setStatus("error");
          setMessage(
            sessionError.message ||
              "No se pudo confirmar la sesión desde el enlace."
          );
          return;
        }

        // ----------------------------------------
        // 2) Sesión establecida → limpiar URL
        // ----------------------------------------
        window.history.replaceState({}, document.title, "/auth/callback");

        setStatus("success");
        setMessage("Sesión iniciada correctamente. Redirigiendo…");

        // ----------------------------------------
        // 3) Leer rol desde user_roles_view
        //    (sin maybeSingle, por si hay varias filas)
        // ----------------------------------------
        let role = "";
        try {
          const { data: rows, error: roleErr } = await supabase
            .from("user_roles_view")
            .select("role_name")
            .limit(1);

          if (roleErr) {
            console.warn("[AuthCallback] error user_roles_view:", roleErr);
          }

          if (rows && rows.length > 0) {
            role = (rows[0].role_name || "").toLowerCase();
          }

          console.log("[AuthCallback] rol detectado:", role);
        } catch (e) {
          console.warn("[AuthCallback] No se pudo leer user_roles_view:", e);
        }

        // ----------------------------------------
        // 4) Decidir destino final
        //
        // Regla de oro:
        //   - Si es tracker  → SIEMPRE /tracker-gps
        //   - Si NO es tracker → /inicio (panel normal)
        //
        // No respetamos ?next ni ?redirect_to para trackers,
        // para que no haya forma de que terminen en el panel.
        // ----------------------------------------
        let target = "/inicio";

        if (role === "tracker") {
          target = "/tracker-gps";
        } else {
          target = "/inicio";
        }

        console.log("[AuthCallback] redirigiendo a:", target);

        setTimeout(() => {
          if (!active) return;
          navigate(target, { replace: true });
        }, 600);
      } catch (e: any) {
        console.error("[AuthCallback] error inesperado:", e);
        if (!active) return;
        setStatus("error");
        setMessage(
          e?.message ??
            "Ocurrió un error inesperado al procesar el enlace. Intenta de nuevo."
        );
      }
    };

    run();

    return () => {
      active = false;
    };
  }, [navigate]);

  const isLoading = status === "loading";
  const isError = status === "error";

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
          {message}
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
