// src/App.jsx
import React, { useMemo, useEffect } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";

import AuthGuard from "./components/AuthGuard.jsx";
import AppHeader from "./components/AppHeader.jsx";
import TopTabs from "./components/TopTabs.jsx";

import PersonalPage from "./components/personal/PersonalPage.jsx";
import AsignacionesPage from "./pages/AsignacionesPage.jsx";
import NuevaGeocerca from "./components/geocercas/NuevaGeocerca.jsx";
import ActividadesPage from "./pages/ActividadesPage.jsx";
import CostosPage from "./pages/CostosPage.jsx";
import CostosDashboardPage from "./pages/CostosDashboardPage.jsx";
import AdminsPage from "./pages/AdminsPage.jsx";
import TrackerDashboard from "./pages/TrackerDashboard.jsx";
import InvitarTracker from "./pages/InvitarTracker.jsx";

import Login from "./pages/Login.tsx";
import AuthCallback from "./pages/AuthCallback.tsx";
import Inicio from "./pages/Inicio.jsx";
import Landing from "./pages/Landing.jsx";
import TrackerGpsPage from "./pages/TrackerGpsPage.jsx";
import ResetPassword from "./pages/ResetPassword.jsx";

import InstructionsPage from "./pages/help/InstructionsPage.jsx";
import FaqPage from "./pages/help/FaqPage.jsx";
import SupportPage from "./pages/help/SupportPage.jsx";
import ChangelogPage from "./pages/help/ChangelogPage.jsx";

import { useAuth } from "./context/AuthContext.jsx";

const PANEL_ROLES = new Set(["owner", "admin", "viewer"]);

function isTrackerHostname(hostname) {
  const h = String(hostname || "").toLowerCase().trim();
  return h === "tracker.tugeocercas.com" || h.startsWith("tracker.");
}

function normalizeRole(r) {
  const v = String(r || "").toLowerCase().trim();
  if (v === "owner") return "owner";
  if (v === "admin") return "admin";
  if (v === "tracker") return "tracker";
  if (v === "viewer") return "viewer";
  return v || "";
}

function getActiveRole(memberships, orgId) {
  if (!orgId) return "";
  const row = Array.isArray(memberships)
    ? memberships.find((m) => m?.org_id === orgId)
    : null;
  return normalizeRole(row?.role);
}

/* ======================================================
   DOMAIN ENFORCER (HARD CANONICAL ROUTING)
   - Tracker domain:
     - CAPTURA magic link (?code / #access_token) y fuerza /auth/callback
     - con sesión => /tracker-gps
     - sin sesión => permitido /, /login, /reset-password, /auth/callback
====================================================== */
function DomainEnforcer() {
  const { loading, session } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const trackerDomain = isTrackerHostname(window.location.hostname);

  useEffect(() => {
    if (loading) return;
    if (!trackerDomain) return;

    const path = location.pathname || "/";
    const search = location.search || "";
    const hash = location.hash || "";

    const hasCode = new URLSearchParams(search).has("code");
    const hasAccessToken = hash.includes("access_token=");
    if ((hasCode || hasAccessToken) && path !== "/auth/callback") {
      navigate(`/auth/callback${search}${hash}`, { replace: true });
      return;
    }

    const publicAllowed = new Set([
      "/",
      "/login",
      "/reset-password",
      "/auth/callback",
      "/tracker-gps",
    ]);

    if (!session) {
      if (!publicAllowed.has(path)) navigate("/", { replace: true });
      return;
    }

    if (path !== "/tracker-gps") navigate("/tracker-gps", { replace: true });
  }, [
    loading,
    session,
    location.pathname,
    location.search,
    location.hash,
    navigate,
    trackerDomain,
  ]);

  return null;
}

function PanelGate({ children }) {
  const { loading, session, role } = useAuth();
  const location = useLocation();

  // ✅ CLAVE: /auth/callback debe ejecutarse sin interferencia del gate
  if (location.pathname === "/auth/callback") {
    return children;
  }

  if (isTrackerHostname(window.location.hostname)) {
    return <Navigate to="/tracker-gps" replace />;
  }

  if (loading) return null;
  if (!session) return <Navigate to="/" replace />;

  const r = String(role || "").toLowerCase().trim();
  if (!r) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center text-slate-600">
        Preparando tu espacio de trabajo…
      </div>
    );
  }

  if (!PANEL_ROLES.has(r)) return <Navigate to="/tracker-gps" replace />;

  return children;
}

function TrackerGate({ children }) {
  const { loading, session, role } = useAuth();

  if (loading) return null;
  if (!session) return <Navigate to="/" replace />;

  if (isTrackerHostname(window.location.hostname)) return children;

  const r = String(role || "").toLowerCase().trim();
  if (!r) return null;

  if (PANEL_ROLES.has(r)) return <Navigate to="/inicio" replace />;

  return children;
}

function Shell() {
  const { loading, memberships, currentOrg, isRootOwner, role } = useAuth();
  const activeOrgId = currentOrg?.id ?? null;

  const activeRole = useMemo(
    () => getActiveRole(memberships, activeOrgId),
    [memberships, activeOrgId]
  );

  if (isTrackerHostname(window.location.hostname)) {
    return <Navigate to="/tracker-gps" replace />;
  }

  const roleLower = String(role || activeRole || "").toLowerCase().trim();

  if (loading) return null;
  if (!roleLower) return null;

  if (!PANEL_ROLES.has(roleLower)) {
    return <Navigate to="/tracker-gps" replace />;
  }

  const tabs = [
    { path: "/inicio", labelKey: "app.tabs.inicio" },
    { path: "/nueva-geocerca", labelKey: "app.tabs.nuevaGeocerca" },
    { path: "/personal", labelKey: "app.tabs.personal" },
    { path: "/actividades", labelKey: "app.tabs.actividades" },
    { path: "/asignaciones", labelKey: "app.tabs.asignaciones" },
    { path: "/costos", labelKey: "app.tabs.reportes" },
    { path: "/costos-dashboard", labelKey: "app.tabs.dashboard" },
    { path: "/tracker-dashboard", labelKey: "app.tabs.tracker" },
    { path: "/invitar-tracker", labelKey: "app.tabs.invitarTracker" },
  ];

  if (isRootOwner === true) tabs.push({ path: "/admins", labelKey: "app.tabs.admins" });

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
  if (loading) return null;
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
  const { session, loading, role } = useAuth();
  if (loading) return null;

  if (isTrackerHostname(window.location.hostname)) {
    return session ? <Navigate to="/tracker-gps" replace /> : <Navigate to="/" replace />;
  }

  if (!session) return <Navigate to="/" replace />;

  const r = String(role || "").toLowerCase().trim();
  if (!r) return null;

  return PANEL_ROLES.has(r) ? (
    <Navigate to="/inicio" replace />
  ) : (
    <Navigate to="/tracker-gps" replace />
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <DomainEnforcer />

      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<LoginShell />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/auth/callback" element={<AuthCallback />} />

        <Route
          path="/tracker-gps"
          element={
            <AuthGuard mode="tracker">
              <TrackerGate>
                <TrackerGpsPage />
              </TrackerGate>
            </AuthGuard>
          }
        />

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
          <Route path="/geocercas" element={<Navigate to="/nueva-geocerca" replace />} />
          <Route path="/personal" element={<PersonalPage />} />
          <Route path="/actividades" element={<ActividadesPage />} />
          <Route path="/asignaciones" element={<AsignacionesPage />} />
          <Route path="/costos" element={<CostosPage />} />
          <Route path="/costos-dashboard" element={<CostosDashboardPage />} />
          <Route path="/tracker-dashboard" element={<TrackerDashboard />} />
          <Route path="/invitar-tracker" element={<InvitarTracker />} />

          <Route
            path="/admins"
            element={
              <RootOwnerRoute>
                <AdminsPage />
              </RootOwnerRoute>
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
