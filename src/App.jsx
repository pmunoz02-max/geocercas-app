// src/App.jsx
import React, { useEffect } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./context/AuthContext.jsx";

import ProtectedShell from "./layouts/ProtectedShell.jsx";
import RequireOrg from "./components/RequireOrg.jsx";
import AuthGuard from "./components/AuthGuard.jsx";

// Public pages
import Landing from "./pages/Landing.jsx";
import Login from "./pages/Login.tsx";
import AuthCallback from "./pages/AuthCallback.tsx";
import ForgotPassword from "./pages/ForgotPassword.jsx";
import ResetPassword from "./pages/ResetPassword.jsx";

// ✅ Claim Invite (nuevo)
import ClaimInvite from "./pages/ClaimInvite.jsx";

// ✅ Privacy Policy (public)
import PrivacyPolicy from "./pages/PrivacyPolicy.jsx";

// Tracker GPS
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
import CostosDashboardPage from "./pages/CostosDashboardPage.jsx";

// Admins
import AdminAssign from "./pages/AdminAssign.tsx";

// Help pages
import InstructionsPage from "./pages/help/InstructionsPage.jsx";
import FaqPage from "./pages/help/FaqPage.jsx";
import SupportPage from "./pages/help/SupportPage.jsx";
import ChangelogPage from "./pages/help/ChangelogPage.jsx";

function CallbackCatcher() {
  const location = useLocation();

  useEffect(() => {
    const pathname = location.pathname || "";
    const search = location.search || "";
    const hash = typeof location.hash === "string" ? location.hash : "";

    const hasAccessToken = hash.includes("access_token=");
    const hasCode = search.includes("code=");
    const hasTokenHash = search.includes("token_hash=");

    if ((hasAccessToken || hasCode || hasTokenHash) && pathname !== "/auth/callback") {
      const target = `/auth/callback${search || ""}${hash || ""}`;
      window.location.replace(target);
    }
  }, [location.pathname, location.search, location.hash]);

  return null;
}

function AdminRoute({ children }) {
  const { loading, user, isAppRoot } = useAuth();
  const location = useLocation();

  if (loading) return null;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  if (!isAppRoot) return <Navigate to="/inicio" replace />;
  return children;
}

export default function App() {
  return (
    <>
      <CallbackCatcher />

      <Routes>
        {/* 🌐 Public */}
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />

        {/* ✅ Privacy Policy (public, required by Google Play) */}
        <Route path="/privacy" element={<PrivacyPolicy />} />

        {/* ✅ Claim invite (public) */}
        <Route path="/claim" element={<ClaimInvite />} />

        {/* ✅ TRACKER GPS */}
        <Route path="/tracker-gps" element={<TrackerGpsPage />} />
        <Route path="/tracker-auth-bridge" element={<TrackerAuthBridge />} />

        {/* 🔐 Password flows */}
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* Legacy redirects */}
        <Route path="/mapa" element={<Navigate to="/geocerca" replace />} />
        <Route path="/geocerca/:id" element={<Navigate to="/geocerca" replace />} />
        <Route path="/tracker-dashboard" element={<Navigate to="/tracker" replace />} />
        <Route path="/admin" element={<Navigate to="/admins" replace />} />
        <Route path="/costos-dashboard" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard-costos" element={<Navigate to="/dashboard" replace />} />

        {/* 🔒 Protected app */}
        <Route
          element={
            <AuthGuard>
              <ProtectedShell />
            </AuthGuard>
          }
        >
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

          {/* Help */}
          <Route path="/help/instructions" element={<InstructionsPage />} />
          <Route path="/help/faq" element={<FaqPage />} />
          <Route path="/help/support" element={<SupportPage />} />
          <Route path="/help/changelog" element={<ChangelogPage />} />

          {/* Admins */}
          <Route
            path="/admins"
            element={
              <AdminRoute>
                <AdminAssign />
              </AdminRoute>
            }
          />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
