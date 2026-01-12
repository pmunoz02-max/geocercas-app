// src/App.jsx
import React from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";

import AuthGuard from "./components/AuthGuard.jsx";
import RequireOrg from "./components/org/RequireOrg.jsx";

import Landing from "./pages/Landing.jsx";
import Login from "./pages/Login.tsx";
import ResetPassword from "./pages/ResetPassword.jsx";
import AuthCallback from "./pages/AuthCallback.tsx";

import Inicio from "./pages/Inicio.jsx";
import NuevaGeocerca from "./components/geocercas/NuevaGeocerca.jsx";
import GeocercasPage from "./pages/GeocercasPage.jsx";
import PersonalPage from "./components/personal/PersonalPage.jsx"; // ✅ FIX
import ActividadesPage from "./pages/ActividadesPage.jsx";
import AsignacionesPage from "./pages/AsignacionesPage.jsx";
import CostosPage from "./pages/CostosPage.jsx";
import CostosDashboardPage from "./pages/CostosDashboardPage.jsx";
import TrackerDashboard from "./pages/TrackerDashboard.jsx";
import InvitarTracker from "./pages/InvitarTracker.jsx";
import AdminsPage from "./pages/AdminsPage.jsx";
import TrackerGpsPage from "./pages/TrackerGpsPage.jsx";

import InstructionsPage from "./pages/help/InstructionsPage.jsx";
import FaqPage from "./pages/help/FaqPage.jsx";
import SupportPage from "./pages/help/SupportPage.jsx";
import ChangelogPage from "./pages/help/ChangelogPage.jsx";

import { useAuth } from "./context/AuthContext.jsx";
import ProtectedShell from "./layouts/ProtectedShell.jsx";

function FullScreenLoader({ text = "Cargando…" }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
      <div className="px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white/70">
        {text}
      </div>
    </div>
  );
}

function RequirePanel({ children }) {
  const { loading, user, currentRole } = useAuth();
  const location = useLocation();

  if (loading) return <FullScreenLoader text="Cargando sesión…" />;

  // ✅ Antes mandaba a "/" (Landing). Ahora manda a login con next.
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search || "/inicio");
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  const role = String(currentRole || "").toLowerCase();
  if (role === "tracker") return <Navigate to="/tracker-gps" replace />;

  return children;
}

function RequireTracker({ children }) {
  const { loading, user, currentRole } = useAuth();
  const location = useLocation();

  if (loading) return <FullScreenLoader text="Cargando sesión…" />;

  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search || "/tracker-gps");
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  const role = String(currentRole || "").toLowerCase();
  if (role !== "tracker") return <Navigate to="/inicio" replace />;

  return children;
}

function AppRootRoute({ children }) {
  const { loading, isAppRoot } = useAuth();
  if (loading) return <FullScreenLoader text="Cargando permisos…" />;
  if (!isAppRoot) return <Navigate to="/inicio" replace />;
  return children;
}

function LoginShell() {
  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-4">
      <div className="w-full max-w-2xl">
        <Login />
      </div>
    </div>
  );
}

function SmartFallback() {
  const { loading, user, currentRole } = useAuth();
  if (loading) return <FullScreenLoader text="Cargando…" />;

  // ✅ Antes mandaba a "/". Ahora manda a login.
  if (!user) return <Navigate to="/login" replace />;

  const role = String(currentRole || "").toLowerCase();
  return role === "tracker" ? <Navigate to="/tracker-gps" replace /> : <Navigate to="/inicio" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Públicas */}
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<LoginShell />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/auth/callback" element={<AuthCallback />} />

        {/* Tracker-only */}
        <Route
          path="/tracker-gps"
          element={
            <AuthGuard>
              <RequireTracker>
                <TrackerGpsPage />
              </RequireTracker>
            </AuthGuard>
          }
        />

        {/* Panel */}
        <Route
          element={
            <AuthGuard>
              <RequirePanel>
                <ProtectedShell />
              </RequirePanel>
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
            path="/costos"
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
            path="/tracker-dashboard"
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

          <Route
            path="/admins"
            element={
              <RequireOrg>
                <AppRootRoute>
                  <AdminsPage />
                </AppRootRoute>
              </RequireOrg>
            }
          />

          <Route path="/help/instructions" element={<InstructionsPage />} />
          <Route path="/help/faq" element={<FaqPage />} />
          <Route path="/help/support" element={<SupportPage />} />
          <Route path="/help/changelog" element={<ChangelogPage />} />
        </Route>

        <Route path="*" element={<SmartFallback />} />
      </Routes>
    </BrowserRouter>
  );
}

