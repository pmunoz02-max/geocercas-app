// src/App.jsx
import React from "react";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";

import AuthGuard from "./components/AuthGuard.jsx";
import AppHeader from "./components/AppHeader.jsx";
import TopTabs from "./components/TopTabs.jsx";

import RequireOrg from "./components/org/RequireOrg.jsx";

import Landing from "./pages/Landing.jsx";
import Login from "./pages/Login.tsx";
import ResetPassword from "./pages/ResetPassword.jsx";
import AuthCallback from "./pages/AuthCallback.tsx";
import InviteCallback from "./pages/InviteCallback.tsx";

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

// ✅ ESTE ES EL IMPORT CORRECTO (evita "./pages/TrackerGps" que no existe)
import TrackerGpsPage from "./pages/TrackerGpsPage.jsx";

import InstructionsPage from "./pages/help/InstructionsPage.jsx";
import FaqPage from "./pages/help/FaqPage.jsx";
import SupportPage from "./pages/help/SupportPage.jsx";
import ChangelogPage from "./pages/help/ChangelogPage.jsx";

import { useAuth } from "./context/AuthContext.jsx";

function FullScreenLoader({ text = "Cargando..." }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="px-4 py-3 rounded-xl bg-white border border-slate-200 shadow-sm text-sm text-slate-600">
        {text}
      </div>
    </div>
  );
}

function RequirePanel({ children }) {
  const { loading, session, bestRole } = useAuth();

  if (loading) return <FullScreenLoader text="Cargando sesión…" />;
  if (!session) return <Navigate to="/" replace />;

  const isTracker = String(bestRole || "").toLowerCase() === "tracker";
  if (isTracker) return <Navigate to="/tracker-gps" replace />;

  return children;
}

function RequireTracker({ children }) {
  const { loading, session, bestRole } = useAuth();

  if (loading) return <FullScreenLoader text="Cargando sesión…" />;
  if (!session) return <Navigate to="/login" replace />;

  const isTracker = String(bestRole || "").toLowerCase() === "tracker";
  if (!isTracker) return <Navigate to="/inicio" replace />;

  return children;
}

function Shell() {
  const { isRootOwner } = useAuth();

  const tabs = [
    { path: "/inicio", labelKey: "app.tabs.inicio" },
    { path: "/nueva-geocerca", labelKey: "app.tabs.nuevaGeocerca" },
    { path: "/geocercas", labelKey: "app.tabs.geocercas" },
    { path: "/personal", labelKey: "app.tabs.personal" },
    { path: "/actividades", labelKey: "app.tabs.actividades" },
    { path: "/asignaciones", labelKey: "app.tabs.asignaciones" },
    { path: "/costos", labelKey: "app.tabs.reportes" },
    { path: "/costos-dashboard", labelKey: "app.tabs.dashboard" },
    { path: "/tracker-dashboard", labelKey: "app.tabs.tracker" },
    { path: "/invitar-tracker", labelKey: "app.tabs.invitarTracker" },
  ];

  if (isRootOwner === true) {
    tabs.push({ path: "/admins", labelKey: "app.tabs.admins" });
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <AppHeader />
      <div className="border-b border-slate-200 bg-white">
        <TopTabs tabs={tabs} />
      </div>
      <main className="flex-1 p-4 max-w-6xl mx-auto w-full">
        <Outlet />
      </main>
    </div>
  );
}

function RootOwnerRoute({ children }) {
  const { loading, isRootOwner } = useAuth();
  if (loading) return <FullScreenLoader text="Cargando permisos…" />;
  if (!isRootOwner) return <Navigate to="/inicio" replace />;
  return children;
}

function LoginShell() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <Login />
    </div>
  );
}

function SmartFallback() {
  const { loading, session, bestRole } = useAuth();
  if (loading) return <FullScreenLoader text="Cargando…" />;
  if (!session) return <Navigate to="/" replace />;

  const isTracker = String(bestRole || "").toLowerCase() === "tracker";
  return isTracker ? <Navigate to="/tracker-gps" replace /> : <Navigate to="/inicio" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<LoginShell />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* ✅ Flujos auth separados */}
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/auth/invite" element={<InviteCallback />} />

        <Route
          path="/tracker-gps"
          element={
            <AuthGuard mode="tracker">
              <RequireTracker>
                <TrackerGpsPage />
              </RequireTracker>
            </AuthGuard>
          }
        />

        <Route
          element={
            <AuthGuard mode="panel">
              <RequirePanel>
                <Shell />
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

          <Route
            path="/admins"
            element={
              <RequireOrg>
                <RootOwnerRoute>
                  <AdminsPage />
                </RootOwnerRoute>
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
