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
import PersonalPage from "./components/personal/PersonalPage.jsx";
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

  if (!user) {
    const next = encodeURIComponent((location.pathname + location.search) || "/inicio");
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  const role = String(currentRole || "").toLowerCase().trim();
  if (role === "tracker") return <Navigate to="/tracker-gps" replace />;

  return children;
}

function RequireTracker({ children }) {
  const { loading, user, currentRole } = useAuth();
  const location = useLocation();

  if (loading) return <FullScreenLoader text="Cargando sesión…" />;

  if (!user) {
    const next = encodeURIComponent((location.pathname + location.search) || "/tracker-gps");
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  const role = String(currentRole || "").toLowerCase().trim();
  if (role !== "tracker") return <Navigate to="/inicio" replace />;

  return children;
}

function AdminDeniedScreen({ reason }) {
  const { user, currentOrg, currentRole, isAppRoot } = useAuth();

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6 space-y-4">
        <h1 className="text-xl font-semibold text-slate-900">Acceso denegado a Administrador</h1>
        <p className="text-sm text-slate-600">
          No se permitió el acceso a <code>/admins</code>. Esto explica por qué al hacer click vuelves a <code>/inicio</code>.
        </p>

        <div className="text-sm text-slate-700 space-y-1">
          <div><b>Email:</b> {user?.email ?? "(sin user)"}</div>
          <div><b>Org actual:</b> {currentOrg?.name ?? currentOrg?.id ?? "(sin org)"}</div>
          <div><b>Role actual:</b> {String(currentRole ?? "(vacío)")}</div>
          <div><b>isAppRoot:</b> {String(!!isAppRoot)}</div>
          <div><b>Motivo:</b> {reason}</div>
        </div>

        <div className="flex flex-wrap gap-3 pt-2">
          <a
            href="/inicio"
            className="px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800"
          >
            Volver a Inicio
          </a>
        </div>
      </div>
    </div>
  );
}

/**
 * ✅ AdminRoute EXPLICATIVO:
 * - ROOT (isAppRoot) entra
 * - OWNER/ADMIN entra
 * - Si no, muestra pantalla con el motivo (no rebote silencioso)
 */
function AdminRoute({ children }) {
  const { loading, user, currentRole, isAppRoot } = useAuth();
  const location = useLocation();

  if (loading) return <FullScreenLoader text="Cargando permisos…" />;

  if (!user) {
    const next = encodeURIComponent((location.pathname + location.search) || "/admins");
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  if (isAppRoot) return children;

  const role = String(currentRole || "").toLowerCase().trim();
  const ok = role === "owner" || role === "admin";

  if (!ok) {
    // En vez de “rebotar” sin explicación:
    return <AdminDeniedScreen reason={`role="${role || "(vacío)"}" no autorizado (se requiere owner/admin o isAppRoot=true)`} />;
  }

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
  if (!user) return <Navigate to="/login" replace />;

  const role = String(currentRole || "").toLowerCase().trim();
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

        {/* Alias por compatibilidad */}
        <Route path="/administrador" element={<Navigate to="/admins" replace />} />

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

          <Route path="/nueva-geocerca" element={<RequireOrg><NuevaGeocerca /></RequireOrg>} />
          <Route path="/geocercas" element={<RequireOrg><GeocercasPage /></RequireOrg>} />
          <Route path="/personal" element={<RequireOrg><PersonalPage /></RequireOrg>} />
          <Route path="/actividades" element={<RequireOrg><ActividadesPage /></RequireOrg>} />
          <Route path="/asignaciones" element={<RequireOrg><AsignacionesPage /></RequireOrg>} />
          <Route path="/costos" element={<RequireOrg><CostosPage /></RequireOrg>} />
          <Route path="/costos-dashboard" element={<RequireOrg><CostosDashboardPage /></RequireOrg>} />
          <Route path="/tracker-dashboard" element={<RequireOrg><TrackerDashboard /></RequireOrg>} />
          <Route path="/invitar-tracker" element={<RequireOrg><InvitarTracker /></RequireOrg>} />

          {/* ✅ Admin module */}
          <Route
            path="/admins"
            element={
              <RequireOrg>
                <AdminRoute>
                  <AdminsPage />
                </AdminRoute>
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
