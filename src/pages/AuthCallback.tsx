// src/pages/AuthCallback.tsx
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function AuthCallback() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;

    // Si no hay sesión, el magic link falló
    if (!session) {
      navigate("/login?error=auth", { replace: true });
      return;
    }

    // ❗ NO decidir rol aquí
    // Dejar que App.jsx (PanelGate / SmartFallback) decida
    navigate("/inicio", { replace: true });
  }, [loading, session, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="px-4 py-3 rounded-xl bg-white border border-slate-200 shadow-sm text-sm text-slate-600">
        Finalizando autenticación…
      </div>
    </div>
  );
}
