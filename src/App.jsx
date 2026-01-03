// src/App.jsx
import React, { useMemo } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
} from "react-router-dom";

import { useAuth } from "./context/AuthContext.jsx";

import AuthGuard from "./components/AuthGuard.jsx";
import AppHeader from "./components/AppHeader.jsx";
import TopTabs from "./components/TopTabs.jsx";

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
import TrackerGpsPage from "./pages/TrackerGpsPage.jsx";

import AdminsPage from "./pages/AdminsPage.jsx";
import InstructionsPage from "./pages/help/InstructionsPage.jsx";
import FaqPage from "./pages/help/FaqPage.jsx";
import SupportPage from "./pages/help/SupportPage.jsx";
import ChangelogPage from "./pages/help/ChangelogPage.jsx";

/* ================= HELPERS ================= */

const PANEL_ROLES = new Set(["owner", "admin", "viewer"]);

function normalizeRole(r) {
  return String(r || "").toLowerCase().trim();
}

/* ================= PANEL GATE ================= */

function PanelGate({ children }) {
  const { loading, session, role } = useAuth();

  if (loading) return null;
  if (!session) return <Navigate to="/" replace />;

  const r = normalizeRole(role);
  if (!PANEL_ROLES.has(r)) {
    return <Navigate to="/tracker-gps" replace />;
  }

  return children;
}

/* ================= SHELL ================= */

function Shell() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <AppHeader />
      <div className="border-b border-slate-200 bg-white">
        <TopTabs />
      </div>
      <main className="flex-1 p-4 max-w-6xl mx-auto w-full">
        <Outlet />
      </main>
    </div>
  );
}

/* ================= FALLBACK ================= */

function SmartFallback() {
  const { loading, session, role } = useAuth();
  if (loading) return null;
  if (!session) return <Navigate to="/" replace />;

  return normalizeRole(role) === "tracker"
    ? <Navigate to="/tracker-gps" replace />
    : <Navigate to="/inicio" replace />;
}

/* ================= APP ================= */

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* PUBLIC */}
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/auth/callback" element={<AuthCallback />} />

        {/* TRACKER */}
        <Route
          path="/tracker-gps"
          element={
            <AuthGuard mode="tracker">
              <TrackerGpsPage />
            </AuthGuard>
          }
        />

        {/* PANEL */}
        <Route
          element={
            <AuthGuard mode="panel">
              <PanelGate>
                <Shell />
              </PanelGate>
            </AuthGuard>
          }
        >
          <Route path="/inicio" element={<Inicio />} />
          <Route path="/nueva-geocerca" element={<NuevaGeocerca />} />
          <Route path="/geocercas" element={<GeocercasPage />} />
          <Route path="/personal" element={<PersonalPage />} />
          <Route path="/actividades" element={<ActividadesPage />} />
          <Route path="/asignaciones" element={<AsignacionesPage />} />
          <Route path="/costos" element={<CostosPage />} />
          <Route path="/costos-dashboard" element={<CostosDashboardPage />} />
          <Route path="/tracker-dashboard" element={<TrackerDashboard />} />
          <Route path="/invitar-tracker" element={<InvitarTracker />} />
          <Route path="/admins" element={<AdminsPage />} />

          <Route path="/help/instructions" element={<InstructionsPage />} />
          <Route path="/help/faq" element={<FaqPage />} />
          <Route path="/help/support" element={<SupportPage />} />
          <Route path="/help/changelog" element={<ChangelogPage />} />
        </Route>

        {/* FALLBACK */}
        <Route path="*" element={<SmartFallback />} />
      </Routes>
    </BrowserRouter>
  );
}
