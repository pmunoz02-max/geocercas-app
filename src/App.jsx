// src/App.jsx
import React from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";

import { useAuthSafe } from "./context/AuthContext.jsx";

import ProtectedShell from "./layouts/ProtectedShell.jsx";
import RequireOrg from "./components/RequireOrg.jsx";
import AuthGuard from "./components/AuthGuard.jsx";

// Public pages
import Landing from "./pages/Landing.jsx";
import Login from "./pages/Login.tsx";
import AuthCallback from "./pages/AuthCallback.tsx";
import ForgotPassword from "./pages/ForgotPassword.jsx";
import UpdatePassword from "./pages/UpdatePassword.jsx";
import ClaimInvite from "./pages/ClaimInvite.jsx";
import PrivacyPolicy from "./pages/PrivacyPolicy.jsx";

// Tracker GPS (public)
import TrackerGpsPage from "./pages/TrackerGpsPage.jsx";
import TrackerAuthBridge from "./pages/TrackerAuthBridge.jsx";

// App pages
import Inicio from "./pages/Inicio.jsx";
import GeocercasPage from "./pages/GeocercasPage.jsx";
import NuevaGeocerca from "./pages/NuevaGeocerca.jsx";
import Personal from "./pages/Personal.jsx";
import ActividadesPage from "./pages/ActividadesPage.jsx";
import AsignacionesPage from "./pages/AsignacionesPage.jsx";
import Reports from "./pages/Reports.jsx";
import TrackerDashboard from "./pages/TrackerDashboard.jsx";
import InvitarTracker from "./pages/InvitarTracker.jsx";
import InvitarAdmin from "./pages/InvitarAdmin.jsx";
import CostosDashboardPage from "./pages/CostosDashboardPage.jsx";

// Admin
import AdminAssign from "./pages/AdminAssign.tsx";

// Help pages
import InstructionsPage from "./pages/help/InstructionsPage.jsx";
import FaqPage from "./pages/help/FaqPage.jsx";
import SupportPage from "./pages/help/SupportPage.jsx";
import ChangelogPage from "./pages/help/ChangelogPage.jsx";

function RootEntry() {
  const location = useLocation();
  const auth = useAuthSafe();

  const hash = typeof location.hash === "string" ? location.hash : "";
  const hasAccessToken = hash.includes("access_token=");
  if (hasAccessToken) {
    const target = `/auth/callback${location.search || ""}${hash || ""}`;
    return <Navigate to={target} replace />;
  }

  const sp = new URLSearchParams(location.search || "");
  const code = sp.get("code");
  if (code) {
    const next = sp.get("next") || "/inicio";
    sp.set("next", next);
    const target = `/auth/callback?${sp.toString()}`;
    return <Navigate to={target} replace />;
  }

  if (!auth || !auth.initialized) {
    return null;
  }

  if (auth.user) {
    return <Navigate to="/inicio" replace />;
  }

  return <Landing />;
}

function TrackerAcceptRedirect() {
  const location = useLocation();
  const sp = new URLSearchParams(location.search || "");
  const orgId = sp.get("org_id") || sp.get("org") || sp.get("orgId") || "";
  const lang = sp.get("lang") || "es";
  const inviteId = sp.get("invite_id") || "";
  const out = new URLSearchParams();
  if (orgId) out.set("org_id", orgId);
  if (lang) out.set("lang", lang);
  if (inviteId) out.set("invite_id", inviteId);
  return <Navigate to={`/tracker-gps?${out.toString()}`} replace />;
}

function AdminRoute({ children }) {
  const auth = useAuthSafe();
  const location = useLocation();

  if (!auth) {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname || "/inicio")}`} replace />;
  }

  const { loading, user, isAppRoot } = auth;
  if (loading) return null;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  if (!isAppRoot) return <Navigate to="/inicio" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<RootEntry />} />
      <Route path="/login" element={<Login />} />
      <Route path="/auth/callback" element={<AuthCallback />} />

      <Route path="/tracker-accept" element={<TrackerAcceptRedirect />} />
      <Route path="/tracker-gps" element={<TrackerGpsPage />} />
      <Route path="/tracker-gps/:orgId" element={<TrackerGpsPage />} />
      <Route path="/tracker-auth-bridge" element={<TrackerAuthBridge />} />

      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<UpdatePassword />} />

      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/claim" element={<ClaimInvite />} />

      <Route path="/mapa" element={<Navigate to="/geocerca" replace />} />
      <Route path="/geocerca/:id" element={<Navigate to="/geocerca" replace />} />
      <Route path="/tracker-dashboard" element={<Navigate to="/tracker" replace />} />
      <Route path="/admin" element={<Navigate to="/admins" replace />} />
      <Route path="/costos-dashboard" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard-costos" element={<Navigate to="/dashboard" replace />} />

      <Route element={<AuthGuard><ProtectedShell /></AuthGuard>}>
        <Route path="/inicio" element={<Inicio />} />
        <Route path="/geocerca" element={<RequireOrg><NuevaGeocerca /></RequireOrg>} />
        <Route path="/geocercas" element={<RequireOrg><GeocercasPage /></RequireOrg>} />
        <Route path="/personal" element={<RequireOrg><Personal /></RequireOrg>} />
        <Route path="/actividades" element={<RequireOrg><ActividadesPage /></RequireOrg>} />
        <Route path="/asignaciones" element={<RequireOrg><AsignacionesPage /></RequireOrg>} />
        <Route path="/reportes" element={<RequireOrg><Reports /></RequireOrg>} />
        <Route path="/dashboard" element={<RequireOrg><CostosDashboardPage /></RequireOrg>} />
        <Route path="/tracker" element={<RequireOrg><TrackerDashboard /></RequireOrg>} />
        <Route path="/invitar-tracker" element={<RequireOrg><InvitarTracker /></RequireOrg>} />

        <Route path="/help/instructions" element={<InstructionsPage />} />
        <Route path="/help/faq" element={<FaqPage />} />
        <Route path="/help/support" element={<SupportPage />} />
        <Route path="/help/changelog" element={<ChangelogPage />} />

        <Route path="/admins" element={<AdminRoute><AdminAssign /></AdminRoute>} />
        <Route path="/invitar-admin" element={<AdminRoute><InvitarAdmin /></AdminRoute>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return <AppRoutes />;
}