import Privacy from "./pages/Privacy.jsx";
import Terms from "./pages/Terms.jsx";
// src/App.jsx
import React from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";

import { AuthProvider, useAuthSafe } from "@/context/auth.js";

import ProtectedShell from "./layouts/ProtectedShell.jsx";
import RequireOrg from "./components/RequireOrg.jsx";
import AuthGuard from "./components/AuthGuard.jsx";

// Public pages
import Landing from "./pages/Landing.jsx";
import DemoGeocercas from "./pages/DemoGeocercas.jsx";
import Login from "./pages/Login.tsx";
import SignUp from "./pages/SignUp.tsx";
import AuthCallback from "./pages/AuthCallback.tsx";
import ForgotPassword from "./pages/ForgotPassword.jsx";
import UpdatePassword from "./pages/UpdatePassword.jsx";

import TrackerInviteStart from "./pages/TrackerInviteStart.jsx";
import TrackerOpen from "./pages/TrackerOpen.jsx";
import TrackerInstall from "./pages/TrackerInstall.jsx";

// Public tracker runtime page
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
import DeleteAccountPage from "./pages/DeleteAccountPage.jsx";
import Account from "@/pages/Account.jsx";

// Billing / Pricing pages
import Billing from "./pages/Billing.jsx";
import BillingSuccess from "./pages/BillingSuccess.jsx";
import BillingCancel from "./pages/BillingCancel.jsx";
import Pricing from "./pages/Pricing.jsx";

// Help pages
import InstructionsPage from "./pages/help/InstructionsPage.jsx";
import FaqPage from "./pages/help/FaqPage.jsx";
import SupportPage from "./pages/help/SupportPage.jsx";
import ChangelogPage from "./pages/help/ChangelogPage.jsx";

import PayPage from "./pages/Pay.jsx";
import RefundPolicy from "./pages/RefundPolicy.jsx";

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

  if (!auth || !auth.initialized) return null;

  if (auth.user) return <Navigate to="/dashboard" replace />;

  return <Landing />;
}

function AdminRoute({ children }) {
  const auth = useAuthSafe();
  const location = useLocation();

  if (!auth) {
    return (
      <Navigate
        to={`/login?next=${encodeURIComponent(location.pathname || "/inicio")}&err=${encodeURIComponent(
          "auth_provider_missing",
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

function MainAppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<RootEntry />} />

      {/* Public */}
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/demo" element={<DemoGeocercas />} />
      <Route path="/demo/quito" element={<Navigate to="/demos/quito-geofence-demo.html" replace />} />
      <Route path="/demo/mwea" element={<Navigate to="/demos/mwea-geofence-demo.html" replace />} />
      <Route path="/demo/mitidja" element={<Navigate to="/demos/mitidja-geofence-demo.html" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<SignUp />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<UpdatePassword />} />
      <Route path="/tracker-invite" element={<TrackerInviteStart />} />
      <Route path="/tracker-accept" element={<TrackerInviteStart />} />
      <Route path="/pay" element={<PayPage />} />
      <Route path="/refund-policy" element={<RefundPolicy />} />

      {/* Legacy redirects */}
      <Route path="/mapa" element={<Navigate to="/geocerca" replace />} />
      <Route path="/geocerca/:id" element={<Navigate to="/geocerca" replace />} />
      <Route path="/nueva-geocerca" element={<Navigate to="/geocerca" replace />} />
      <Route path="/new-geofence" element={<Navigate to="/geocerca" replace />} />
      <Route path="/geofences" element={<Navigate to="/geocercas" replace />} />
      <Route path="/tracker-dashboard" element={<Navigate to="/tracker" replace />} />
      <Route path="/admin" element={<Navigate to="/admins" replace />} />
      <Route path="/costos-dashboard" element={<Navigate to="/dashboard-costs" replace />} />
      <Route path="/dashboard-costos" element={<Navigate to="/dashboard-costs" replace />} />

      {/* Protected */}
      <Route
        element={
          <AuthGuard>
            <ProtectedShell />
          </AuthGuard>
        }
      >
        <Route path="/inicio" element={<Inicio />} />

        <Route
          path="/dashboard"
          element={
            <RequireOrg>
              <TrackerDashboard />
            </RequireOrg>
          }
        />

        <Route
          path="/dashboard-costs"
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
          path="/billing"
          element={
            <RequireOrg>
              <Billing />
            </RequireOrg>
          }
        />
        <Route path="/account" element={<Account />} />
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
          path="/settings/delete-account"
          element={
            <RequireOrg>
              <DeleteAccountPage />
            </RequireOrg>
          }
        />

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
            <AdminRoute>
              <InvitarAdmin />
            </AdminRoute>
          }
        />

        <Route path="/help/instructions" element={<InstructionsPage />} />
        <Route path="/help/faq" element={<FaqPage />} />
        <Route path="/help/support" element={<SupportPage />} />
        <Route path="/help/changelog" element={<ChangelogPage />} />

        <Route
          path="/settings"
          element={
            <RequireOrg>
              <DeleteAccountPage />
            </RequireOrg>
          }
        />
      </Route>

      {/* El redirect global no debe atrapar rutas tracker-open, tracker-gps, tracker-install */}
      <Route
        path="*"
        element={
          ["/tracker-open", "/tracker-gps", "/tracker-install"].some((r) => window.location.pathname.startsWith(r))
            ? null
            : <Navigate to="/" replace />
        }
      />
    </Routes>
  );
}

function MainApp() {
  return (
    <AuthProvider>
      <MainAppRoutes />
    </AuthProvider>
  );
}

export default function App() {
  return (
    <Routes>
      {/* Rutas públicas para tracker */}
      <Route path="/tracker-gps" element={<TrackerGpsPage />} />
      <Route path="/tracker-open" element={<TrackerOpen />} />
      <Route path="/tracker-install" element={<TrackerInstall />} />
      <Route path="/tracker-accept" element={<TrackerInviteStart />} />
      <Route path="/accept-invite" element={<TrackerInviteStart />} />
      <Route path="/pay" element={<PayPage />} />
      <Route path="/*" element={<MainApp />} />
    </Routes>
  );
}