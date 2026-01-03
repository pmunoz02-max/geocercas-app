// src/pages/AuthCallback.tsx
import React, { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function AuthCallback() {
  const navigate = useNavigate();
  const { loading, session, reloadAuth } = useAuth();
  const ranOnce = useRef(false);

  useEffect(() => {
    if (loading) return;

    // ❌ Sin sesión: auth falló
    if (!session) {
      navigate("/login", { replace: true });
      return;
    }

    // ✅ Con sesión: solo asegurar que AuthContext esté recalculado
    if (!ranOnce.current) {
      ranOnce.current = true;
      if (typeof reloadAuth === "function") reloadAuth();
    }

    // ✅ NO decidir rol ni destino aquí
    // 👉 Punto neutro, App.jsx decide
    navigate("/inicio", { replace: true });
  }, [loading, session, reloadAuth, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="px-4 py-3 rounded-xl bg-white border border-slate-200 shadow-sm text-sm text-slate-600">
        Finalizando autenticación…
      </div>
    </div>
  );
}
