// src/App.jsx
import React from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";

import { useAuthSafe } from "@/context/auth.js";

import ProtectedShell from "./layouts/ProtectedShell.jsx";
import RequireOrg from "./components/RequireOrg.jsx";
import AuthGuard from "./components/AuthGuard.jsx";

// Public pages
import Landing from "./pages/Landing.jsx";
import Login from "./pages/Login.tsx";
import AuthCallback from "./pages/AuthCallback.tsx";
import ForgotPassword from "./pages/ForgotPassword.jsx";
import UpdatePassword from "./pages/UpdatePassword.jsx";

// ✅ Tracker GPS public page
import TrackerGpsPage from "./pages/TrackerGpsPage.jsx";

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

// ✅ Billing / Pricing pages
import Billing from "./pages/Billing.jsx";
import BillingSuccess from "./pages/BillingSuccess.jsx";
import BillingCancel from "./pages/BillingCancel.jsx";
import Pricing from "./pages/Pricing.jsx";

// Help pages
import InstructionsPage from "./pages/help/InstructionsPage.jsx";
import FaqPage from "./pages/help/FaqPage.jsx";
import SupportPage from "./pages/help/SupportPage.jsx";
import ChangelogPage from "./pages/help/ChangelogPage.jsx";

function RootEntry() {
  const location = useLocation();

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

  return <Landing />;
}

/**
 * ✅ RUTA PUBLICA /tracker-accept
 * Recibe: /tracker-accept?invite_id=...&org_id=...&lang=en
 * Redirige a: /tracker-gps?org_id=...&lang=en&invite_id=...
 */
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
    return (
      <Navigate
        to={`/login?next=${encodeURIComponent(location.pathname || "/inicio")}&err=${encodeURIComponent(
          "auth_provider_missing"
        )}`}
        replace
      />
    );
  }

  const { loading, user, isAppRoot } = auth;
  if (loading) return null;

  if (!user) {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  }

  if (!isAppRoot) return <Navigate to="/inicio" replace />;

  return children;
}

function AppRoutes() {
  return (
    <Routes>
      {/* 🌐 Public */}
      <Route path="/" element={<RootEntry />} />
      <Route path="/login" element={<Login />} />

      {/* ✅ App callback */}
      <Route path="/auth/callback" element={<AuthCallback />} />

      {/* ✅ Tracker Accept (PUBLIC) */}
      <Route path="/tracker-accept" element={<TrackerAcceptRedirect />} />

      {/* ✅ Tracker GPS (PUBLIC) */}
      <Route path="/tracker-gps" element={<TrackerGpsPage />} />
      <Route path="/tracker-gps/:orgId" element={<TrackerGpsPage />} />

      {/* 🔐 Password flows */}
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<UpdatePassword />} />

      {/* Legacy redirects */}
      <Route path="/mapa" element={<Navigate to="/geocerca" replace />} />
      <Route path="/geocerca/:id" element={<Navigate to="/geocerca" replace />} />
      <Route path="/tracker-dashboard" element={<Navigate to="/tracker" replace />} />
      <Route path="/admin" element={<Navigate to="/admins" replace />} />
      <Route path="/costos-dashboard" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard-costos" element={<Navigate to="/dashboard" replace />} />

      {/* 🔒 Protected */}
      <Route
        element={
          <AuthGuard>
            <ProtectedShell />
          </AuthGuard>
        }
      >
        <Route path="/inicio" element={<Inicio />} />

        {/* ✅ Billing / Pricing */}
        <Route
          path="/billing"
          element={
            <RequireOrg>
              <Billing />
            </RequireOrg>
          }
        />
        <Route
          path="/pricing"
          element={
            <RequireOrg>
              <Pricing />
            </RequireOrg>
          }
        />
        <Route path="/billing/success" element={<BillingSuccess />} />
        <Route path="/billing/cancel" element={<BillingCancel />} />

        <Route
          path="/geocerca"
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
          path="/dashboard"
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

        {/* Help */}
        <Route path="/help/instructions" element={<InstructionsPage />} />
        <Route path="/help/faq" element={<FaqPage />} />
        <Route path="/help/support" element={<SupportPage />} />
        <Route path="/help/changelog" element={<ChangelogPage />} />

        <Route
          path="/admins"
          element={
            <AdminRoute>
              <InvitarAdmin />
            </AdminRoute>
          }
        />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return <AppRoutes />;
}