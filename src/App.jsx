// src/App.jsx
import React, { useEffect } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";

import { useAuth } from "./context/AuthContext.jsx";

/* Guards */
import AuthGuard from "./components/AuthGuard.jsx";

/* Layout */
import ProtectedShell from "./layouts/ProtectedShell.jsx";
import RequireOrg from "./components/org/RequireOrg.jsx";

/* Public pages */
import Landing from "./pages/Landing.jsx";
import LoginShell from "./pages/LoginShell.jsx";
import ResetPassword from "./pages/ResetPassword.jsx";
import AuthCallback from "./pages/AuthCallback.tsx";

/* Panel pages */
import Inicio from "./pages/Inicio.jsx";
import GeocercasPage from "./pages/GeocercasPage.jsx";
import NuevaGeocerca from "./components/geocercas/NuevaGeocerca.jsx";
import PersonalPage from "./components/personal/PersonalPage.jsx";
import ActividadesPage from "./pages/ActividadesPage.jsx";
import AsignacionesPage from "./pages/AsignacionesPage.jsx";
import CostosPage from "./pages/CostosPage.jsx";
import CostosDashboardPage from "./pages/CostosDashboardPage.jsx";
import TrackerDashboard from "./pages/TrackerDashboard.jsx";
import InvitarTracker from "./pages/InvitarTracker.jsx";

/* Admin (SaaS) */
import InvitarAdmin from "./pages/InvitarAdmin.jsx";

/**
 * HashTokenCatcher (UNIVERSAL)
 * - Si Supabase redirige con tokens en el HASH (#access_token=...),
 *   y el usuario cae en "/" (Landing), reenviamos a /auth/callback
 *   preservando hash+query para que AuthCallback guarde sesión y redirija.
 */
function HashTokenCatcher() {
  const location = useLocation();

  useEffect(() => {
    const hasAccessToken =
      typeof location.hash === "string" && location.hash.includes("access_token=");
    if (hasAccessToken && location.pathname !== "/auth/callback") {
      const target = `/auth/callback${location.search || ""}${location.hash || ""}`;
      window.location.replace(target);
    }
  }, [location.pathname, location.search, location.hash]);

  return null;
}

/**
 * AdminRoute: solo App Root puede entrar a /admins
 */
function AdminRoute({ children }) {
  const { loading, user, isAppRoot } = useAuth();
  const location = useLocation();

  if (loading) return null;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (!isAppRoot) return <Navigate to="/inicio" replace />;

  return children;
}

function App() {
  return (
    <BrowserRouter>
      <HashTokenCatcher />

      <Routes>
        {/* ---------- Public ---------- */}
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<LoginShell />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/auth/callback" element={<AuthCallback />} />

        {/* Alias legacy */}
        <Route path="/administrador" element={<Navigate to="/admins" replace />} />

        {/* ---------- Protected ---------- */}
        <Route
          path="/"
          element={
            <AuthGuard>
              <ProtectedShell />
            </AuthGuard>
          }
        >
          <Route path="/inicio" element={<Inicio />} />

          <Route
            path="/nueva-geocerca"
            element={
              <RequireOrg>
                <NuevaGeocerca />
              </RequireOrg>
            }
          />

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
                <PersonalPage />
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
                <CostosPage />
              </RequireOrg>
            }
          />

          <Route
            path="/costos-dashboard"
            element={
              <RequireOrg>
                <CostosDashboardPage />
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

export default App;
