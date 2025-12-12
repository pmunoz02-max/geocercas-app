import React from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import AuthGuard from "./components/AuthGuard.jsx";
import RequireOrg from "./components/RequireOrg.jsx";

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

import InstructionsPage from "./pages/help/InstructionsPage.jsx";
import OnboardingCreateOrgPage from "./pages/OnboardingCreateOrgPage.jsx";

import { useAuth } from "./context/AuthContext.jsx";

// ---------------------
// Layout interno
// ---------------------
function Shell({ children }) {
  const { loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="px-4 py-3 rounded-xl bg-white border shadow-sm">
          Cargando tu sesión…
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
    { path: "/admins", labelKey: "app.tabs.admins" },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <AppHeader />
      <div className="border-b bg-white">
        <TopTabs tabs={tabs} />
      </div>
      <main className="flex-1 p-4 max-w-6xl mx-auto w-full">
        {children}
      </main>
    </div>
  );
}

function LoginShell() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <Login />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Landing */}
        <Route path="/" element={<Landing />} />

        {/* Auth */}
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/login" element={<LoginShell />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* Onboarding obligatorio */}
        <Route
          path="/onboarding/create-org"
          element={
            <AuthGuard>
              <OnboardingCreateOrgPage />
            </AuthGuard>
          }
        />

        {/* App protegida + requiere organización */}
        <Route
          path="/inicio"
          element={
            <AuthGuard>
              <RequireOrg>
                <Shell>
                  <Inicio />
                </Shell>
              </RequireOrg>
            </AuthGuard>
          }
        />

        {/* Repetimos el patrón para todos los módulos */}
        {[
          ["/nueva-geocerca", <NuevaGeocerca />],
          ["/geocercas", <GeocercasPage />],
          ["/personal", <PersonalPage />],
          ["/actividades", <ActividadesPage />],
          ["/asignaciones", <AsignacionesPage />],
          ["/costos", <CostosPage />],
          ["/costos-dashboard", <CostosDashboardPage />],
          ["/tracker-dashboard", <TrackerDashboard />],
          ["/invitar-tracker", <InvitarTracker />],
          ["/admins", <AdminsPage />],
          ["/help/instructions", <InstructionsPage />],
          ["/tracker-gps", <TrackerGpsPage />],
        ].map(([path, component]) => (
          <Route
            key={path}
            path={path}
            element={
              <AuthGuard>
                <RequireOrg>
                  <Shell>{component}</Shell>
                </RequireOrg>
              </AuthGuard>
            }
          />
        ))}

        <Route path="*" element={<Navigate to="/inicio" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
