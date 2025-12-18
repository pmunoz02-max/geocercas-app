// src/components/AuthGuard.jsx
import { useEffect } from "react";
import { useLocation, Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function AuthGuard({ children }) {
  const { session, loading, role } = useAuth();
  const location = useLocation();

  // 1) Mientras no sabemos sesión / rol → loader
  if (loading || (session && role == null)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="px-4 py-3 rounded-xl bg-white border border-slate-200 shadow-sm text-sm text-slate-600">
          Cargando permisos…
        </div>
      </div>
    );
  }

  // 2) Sin sesión → login
  if (!session) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname }}
      />
    );
  }

  const roleLower = String(role || "").toLowerCase();
  const path = location.pathname;

  // 3) 🚨 TRACKER = REDIRECT DURO (NO Navigate)
  //    Esto evita que Shell / panel se monten siquiera 1 frame
  if (roleLower === "tracker") {
    if (!path.startsWith("/tracker-gps")) {
      // hard redirect: mata el árbol React actual
      window.location.replace("/tracker-gps");
      return null;
    }
  }

  // 4) NO-TRACKER: nunca puede estar en tracker-gps
  if (roleLower !== "tracker" && path.startsWith("/tracker-gps")) {
    return <Navigate to="/inicio" replace />;
  }

  // 5) Todo OK
  return children;
}
