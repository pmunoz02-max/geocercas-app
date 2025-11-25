// src/pages/AuthCallback.tsx
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useNavigate } from "react-router-dom";

export default function AuthCallback() {
  const [msg, setMsg] = useState("Confirmando sesión...");
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        // ✅ Intercambia el código de verificación por la sesión
        const { error } = await supabase.auth.exchangeCodeForSession(window.location.href);

        if (!active) return;

        if (error) {
          console.error("AuthCallback error:", error);
          setMsg(`No se pudo confirmar la sesión: ${error.message}`);
          return;
        }

        setMsg("Sesión confirmada ✅ Redirigiendo...");
        // Espera 1.2s para dar feedback visual
        setTimeout(() => {
          navigate("/", { replace: true });
        }, 1200);
      } catch (err: any) {
        if (active) setMsg(err?.message ?? "Error desconocido durante el inicio de sesión.");
      }
    })();

    return () => {
      active = false;
    };
  }, [navigate]);

  return (
    <div className="w-full min-h-[60vh] flex items-center justify-center">
      <p className="text-gray-700 text-lg font-medium">{msg}</p>
    </div>
  );
}
