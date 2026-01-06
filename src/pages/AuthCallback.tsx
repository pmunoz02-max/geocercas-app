// src/pages/AuthCallback.tsx
import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

// Ajusta este import si tu supabaseClient está en otra ruta
import { supabase } from "../supabaseClient";

export default function AuthCallback() {
  const navigate = useNavigate();
  const { loading, session, reloadAuth } = useAuth();

  // Evita loops
  const exchangedOnce = useRef(false);
  const navigatedOnce = useRef(false);

  const [status, setStatus] = useState<"processing" | "error" | "done">(
    "processing"
  );
  const [errorMsg, setErrorMsg] = useState<string>("");

  useEffect(() => {
    // Esperar a que AuthContext termine su carga inicial
    if (loading) return;

    const run = async () => {
      try {
        // Si ya hay sesión, terminamos y delegamos flujo normal
        if (session) {
          if (!navigatedOnce.current) {
            navigatedOnce.current = true;

            // Recalcula org/role una vez (tu lógica existente)
            if (typeof reloadAuth === "function") {
              await reloadAuth();
            }

            setStatus("done");
            navigate("/inicio", { replace: true });
          }
          return;
        }

        // No hay sesión todavía: intentamos "exchange" si este callback trae credenciales
        const url = new URL(window.location.href);
        const params = url.searchParams;

        // Supabase puede devolver "code" (PKCE) o "token_hash" + "type"
        const hasCode = params.has("code");
        const hasTokenHash = params.has("token_hash") && params.has("type");

        // También puede venir error
        const errDesc =
          params.get("error_description") || params.get("error") || "";

        if (errDesc) {
          setStatus("error");
          setErrorMsg(errDesc);
          navigate("/login?auth=error", { replace: true });
          return;
        }

        // Si no trae nada, es un callback inválido → login
        if (!hasCode && !hasTokenHash) {
          navigate("/login", { replace: true });
          return;
        }

        // Hacemos exchange SOLO UNA VEZ
        if (!exchangedOnce.current) {
          exchangedOnce.current = true;

          // Esto crea la sesión en el cliente
          const { error } = await supabase.auth.exchangeCodeForSession(
            window.location.href
          );

          if (error) {
            console.error("[AuthCallback] exchangeCodeForSession error:", error);
            setStatus("error");
            setErrorMsg(error.message || "Auth exchange failed");
            navigate("/login?auth=error", { replace: true });
            return;
          }

          // Forzar recálculo de org/role y refrescar auth state
          if (typeof reloadAuth === "function") {
            await reloadAuth();
          }

          // Esperamos al próximo render: si session aparece, el bloque superior redirige
          return;
        }

        // Si ya intentamos exchange y aún no hay sesión, mandamos a login
        navigate("/login?auth=missing_session", { replace: true });
      } catch (e: any) {
        console.error("[AuthCallback] unexpected error:", e);
        setStatus("error");
        setErrorMsg(String(e?.message || e));
        navigate("/login?auth=error", { replace: true });
      }
    };

    run();
  }, [loading, session, reloadAuth, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="px-4 py-3 rounded-xl bg-white border border-slate-200 shadow-sm text-sm text-slate-600">
        {status === "processing" && "Finalizando autenticación…"}
        {status === "done" && "Listo. Redirigiendo…"}
        {status === "error" && (
          <div className="text-red-600">
            Error de autenticación{errorMsg ? `: ${errorMsg}` : ""}.
          </div>
        )}
      </div>
    </div>
  );
}
