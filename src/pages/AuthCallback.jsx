// src/pages/AuthCallback.jsx
import React, { useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

function isSafeInternalPath(p) {
  if (!p) return false;
  if (typeof p !== "string") return false;

  // Solo rutas internas absolutas
  if (!p.startsWith("/")) return false;

  // Evitar esquemas raros o intentos de URL externas
  if (p.includes("://")) return false;

  // Evitar doble slash tipo //evil.com
  if (p.startsWith("//")) return false;

  // Evitar caracteres de control
  if (/[\u0000-\u001F\u007F]/.test(p)) return false;

  return true;
}

export default function AuthCallback() {
  const navigate = useNavigate();
  const location = useLocation();

  const { loading, session, role, isRootOwner } = useAuth();

  const nextParam = useMemo(() => {
    const sp = new URLSearchParams(location.search);
    const next = sp.get("next");
    return next || null;
  }, [location.search]);

  useEffect(() => {
    // Esperar a que AuthContext termine de cargar
    if (loading) return;

    // Si no hay sesión, volver a login
    if (!session) {
      navigate("/login", { replace: true });
      return;
    }

    const roleLower = String(role || "").toLowerCase();

    // ✅ REGLA UNIVERSAL: tracker SIEMPRE aterriza en la pantalla de envío automático
    if (roleLower === "tracker") {
      navigate("/tracker-gps", { replace: true });
      return;
    }

    // Para NO-trackers: respetar next si es seguro y permitido
    let dest = "/inicio";

    if (nextParam && isSafeInternalPath(nextParam)) {
      // Bloquear acceso directo a tracker-gps para no-trackers
      if (nextParam.startsWith("/tracker-gps")) {
        dest = "/inicio";
      }
      // Bloquear /admins si no es root owner
      else if (nextParam.startsWith("/admins") && !isRootOwner) {
        dest = "/inicio";
      } else {
        dest = nextParam;
      }
    }

    navigate(dest, { replace: true });
  }, [loading, session, role, isRootOwner, nextParam, navigate]);

  // UI simple mientras decide
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="px-4 py-3 rounded-xl bg-white border border-slate-200 shadow-sm text-sm text-slate-600">
        Finalizando autenticación…
      </div>
    </div>
  );
}
