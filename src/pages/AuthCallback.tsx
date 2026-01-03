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

    if (!session) {
      navigate("/login", { replace: true });
      return;
    }

    // Recalcula org/role una vez y suelta el control a App.jsx
    if (!ranOnce.current) {
      ranOnce.current = true;
      if (typeof reloadAuth === "function") reloadAuth();
    }

    // Punto neutro: App.jsx (SmartFallback/Require*) decide destino final
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
