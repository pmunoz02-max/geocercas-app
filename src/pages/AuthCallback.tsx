// src/pages/AuthCallback.tsx
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function AuthCallback() {
  const navigate = useNavigate();
  const { session, loading, role } = useAuth();

  useEffect(() => {
    if (loading) return;

    // ❌ Si no hay sesión, algo falló
    if (!session) {
      navigate("/login?error=auth", { replace: true });
      return;
    }

    const roleLower = String(role || "").toLowerCase();

    // ✅ Redirección final correcta
    if (roleLower === "tracker") {
      navigate("/tracker-gps", { replace: true });
    } else {
      navigate("/inicio", { replace: true });
    }
  }, [loading, session, role, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="px-4 py-3 rounded-xl bg-white border border-slate-200 shadow-sm text-sm text-slate-600">
        Procesando autenticación…
      </div>
    </div>
  );
}
