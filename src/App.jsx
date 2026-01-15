import React, { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";

import { useAuth } from "./context/AuthContext.jsx";
import ProtectedShell from "./layouts/ProtectedShell.jsx";
import RequireOrg from "./components/RequireOrg.jsx";
import AuthGuard from "./components/AuthGuard.jsx";

// Páginas
import Landing from "./pages/Landing.jsx";
import Login from "./pages/Login.tsx";
import AuthCallback from "./pages/AuthCallback.tsx";
import ResetPassword from "./pages/ResetPassword.jsx";

import Inicio from "./pages/Inicio.jsx";
import GeocercasPage from "./pages/GeocercasPage.jsx";
import Personal from "./pages/Personal.jsx";
import ActividadesPage from "./pages/ActividadesPage.jsx";
import AsignacionesPage from "./pages/AsignacionesPage.jsx";
import Reports from "./pages/Reports.jsx";
import TrackerDashboard from "./pages/TrackerDashboard.jsx";
import InvitarTracker from "./pages/InvitarTracker.jsx";
import InvitarAdmin from "./pages/InvitarAdmin.jsx";

/**
 * HashTokenCatcher (UNIVERSAL)
 * Si Supabase redirige con tokens en el HASH (#access_token=...),
 * reenviamos a /auth/callback preservando hash+query.
 */
function HashTokenCatcher() {
  const location = useLocation();

  useEffect(() => {
    const hash = typeof location.hash === "string" ? location.hash : "";
    const hasAccessToken = hash.includes("access_token=");
    if (hasAccessToken && location.pathname !== "/auth/callback") {
      const target = `/auth/callback${location.search || ""}${hash || ""}`;
      window.location.replace(target);
    }
  }, [location.pathname, location.search, location.hash]);

  return null;
}

/**
 * AdminRoute: solo App Root entra a /admins
 */
function AdminRoute({ children }) {
  const { loading, user, isAppRoot } = useAuth();
  const location = useLocation();

  if (loading) return null;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  if (!isAppRoot) return <Navigate to="/inicio" replace />;

  return children;
}

/**
 * AliasRoutes (UNIVERSAL)
 * Blindaje definitivo contra rutas legacy (links viejos, bookmarks, módulos antiguos).
 * Regla: si una ruta antigua aparece en el código o en bookmarks de usuarios,
 * aquí se redirige a la ruta canónica sin romper UX.
 */
function AliasRoutes() {
  return (
    <>
      {/* Geocerca singular -> Geocercas plural (canónico actual en tu Router) */}
      <Route path="/geocerca" element={<Navigate to="/geocercas" replace />} />
      <Route path="/geocerca/:id" element={<Navigate to="/geocercas" replace />} />

      {/* Tracker legacy */}
      <Route path="/tracker-dashboard" element={<Navigate to="/tracker" replace />} />
      <Route path="/tracker-gps" element={<Navigate to="/tracker" replace />} />

      {/* Admin legacy */}
      <Route path="/admin" element={<Navigate to="/admins" replace />} />

      {/* Mapa legacy (ajusta destino si defines página /mapa real) */}
      <Route path="/mapa" element={<Navigate to="/geocercas" replace />} />
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <HashTokenCatcher />

      <Routes>
        {/* ---------- Public ---------- */}
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* ---------- Alias / Redirects (antes del shell protegido) ---------- */}
        <AliasRoutes />

        {/* ---------- Protected shell ---------- */}
        <Route
          element={
            <AuthGuard>
              <ProtectedShell />
            </AuthGuard>
          }
        >
          <Route path="/inicio" element={<Inicio />} />

          <Route
            path="/geocercas"
            element={
              <RequireOrg>
                <GeocercasPage />
              </RequireOrg>
            }
          />

          <Route
            path="/personal"
            element={
              <RequireOrg>
                <Personal />
              </RequireOrg>
            }
          />

          <Route
            path="/actividades"
            element={
              <RequireOrg>
                <ActividadesPage />
              </RequireOrg>
            }
          />

          <Route
            path="/asignaciones"
            element={
              <RequireOrg>
                <AsignacionesPage />
              </RequireOrg>
            }
          />

          <Route
            path="/reportes"
            element={
              <RequireOrg>
                <Reports />
              </RequireOrg>
            }
          />

          <Route
            path="/tracker"
            element={
              <RequireOrg>
                <TrackerDashboard />
              </RequireOrg>
            }
          />

          <Route
            path="/invitar-tracker"
            element={
              <RequireOrg>
                <InvitarTracker />
              </RequireOrg>
            }
          />

          {/* ---------- Admin (App Root) ---------- */}
          <Route
            path="/admins"
            element={
              <AdminRoute>
                <InvitarAdmin />
              </AdminRoute>
            }
          />
        </Route>

        {/* ---------- Fallback ---------- */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
