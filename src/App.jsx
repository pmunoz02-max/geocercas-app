// src/App.jsx
import React, { useMemo } from "react";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";

import AuthGuard from "./components/AuthGuard.jsx";
import AppHeader from "./components/AppHeader.jsx";
import TopTabs from "./components/TopTabs.jsx";

import PersonalPage from "./components/personal/PersonalPage.jsx";
import AsignacionesPage from "./pages/AsignacionesPage.jsx";
import NuevaGeocerca from "./components/geocercas/NuevaGeocerca.jsx";
import GeocercasPage from "./pages/GeocercasPage.jsx";
import ActividadesPage from "./pages/ActividadesPage.jsx";
import CostosPage from "./pages/CostosPage.jsx";
import CostosDashboardPage from "./pages/CostosDashboardPage.jsx";
import AdminsPage from "./pages/AdminsPage.jsx";
import TrackerDashboard from "./pages/TrackerDashboard.jsx";
import InvitarTracker from "./pages/InvitarTracker.jsx";

import Login from "./pages/Login.tsx";
import AuthCallback from "./pages/AuthCallback";
import Inicio from "./pages/Inicio.jsx";
import Landing from "./pages/Landing.jsx";
import TrackerGpsPage from "./pages/TrackerGpsPage.jsx";
import ResetPassword from "./pages/ResetPassword.jsx";

// Ayuda (si aplica)
import InstructionsPage from "./pages/help/InstructionsPage.jsx";
import FaqPage from "./pages/help/FaqPage.jsx";
import SupportPage from "./pages/help/SupportPage.jsx";
import ChangelogPage from "./pages/help/ChangelogPage.jsx";

import { useAuth } from "./context/AuthContext.jsx";

/* ======================================================
   HELPERS: Rol activo por organización (UNIVERSAL)
====================================================== */
function normalizeRole(r) {
  const v = String(r || "").toLowerCase();
  if (v === "owner") return "owner";
  if (v === "admin") return "admin";
  if (v === "tracker") return "tracker";
  if (v === "viewer") return "viewer";
  return v || "tracker";
}

function getActiveRole(memberships, orgId) {
  if (!orgId) return "tracker";
  const row = Array.isArray(memberships)
    ? memberships.find((m) => m?.org_id === orgId)
    : null;
  return normalizeRole(row?.role);
}

/* ======================================================
   SHELL (Layout persistente con tabs + <Outlet />)
   ✅ Admin tab SOLO si activeRole === "owner"
====================================================== */
function Shell() {
  const { loading, memberships, currentOrg } = useAuth();

  const activeOrgId = currentOrg?.id ?? null;

  const activeRole = useMemo(() => {
    return getActiveRole(memberships, activeOrgId);
  }, [memberships, activeOrgId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="px-4 py-3 rounded-xl bg-white border border-slate-200 shadow-sm text-sm text-slate-600">
          Cargando organización y permisos…
        </div>
      </div>
    );
  }

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

  // ✅ UNIVERSAL: Admin tab SOLO si es OWNER EN LA ORG ACTIVA
  if (activeRole === "owner") {
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

/* ======================================================
   GUARD: /admins SOLO si activeRole === "owner"
   ✅ NO depende de correo, ni de rol global
====================================================== */
function OwnerRoute({ children }) {
  const { loading, memberships, currentOrg } = useAuth();

  const activeOrgId = currentOrg?.id ?? null;
  const activeRole = useMemo(() => getActiveRole(memberships, activeOrgId), [memberships, activeOrgId]);

  if (loading) return null;
  if (activeRole !== "owner") return <Navigate to="/inicio" replace />;

  return children;
}

function LoginShell() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <Login />
    </div>
  );
}

/* ======================================================
   APP ROUTES
====================================================== */
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* PUBLIC */}
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<LoginShell />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/auth/callback" element={<AuthCallback />} />

        {/* PRIVATE (panel) */}
        <Route
          element={
            <AuthGuard>
              <Shell />
            </AuthGuard>
          }
        >
          <Route path="/inicio" element={<Inicio />} />

          {/* Tabs */}
          <Route path="/nueva-geocerca" element={<NuevaGeocerca />} />
          <Route path="/geocercas" element={<GeocercasPage />} />
          <Route path="/personal" element={<PersonalPage />} />
          <Route path="/actividades" element={<ActividadesPage />} />
          <Route path="/asignaciones" element={<AsignacionesPage />} />
          <Route path="/costos" element={<CostosPage />} />
          <Route path="/costos-dashboard" element={<CostosDashboardPage />} />
          <Route path="/tracker-dashboard" element={<TrackerDashboard />} />
          <Route path="/invitar-tracker" element={<InvitarTracker />} />

          {/* Tracker */}
          <Route path="/tracker-gps" element={<TrackerGpsPage />} />

          {/* ✅ Admin solo owner en org activa */}
          <Route
            path="/admins"
            element={
              <OwnerRoute>
                <AdminsPage />
              </OwnerRoute>
            }
          />

          {/* Help */}
          <Route path="/help/instructions" element={<InstructionsPage />} />
          <Route path="/help/faq" element={<FaqPage />} />
          <Route path="/help/support" element={<SupportPage />} />
          <Route path="/help/changelog" element={<ChangelogPage />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/inicio" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
