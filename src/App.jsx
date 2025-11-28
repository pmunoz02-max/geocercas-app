// src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import AuthGuard from "./components/AuthGuard.jsx";
import PublicOnly from "./components/PublicOnly.jsx";
import AppHeader from "./components/AppHeader.jsx";
import TopTabs from "./components/TopTabs.jsx";

// --- Páginas principales ---
import PersonalPage from "./components/personal/PersonalPage.jsx";
import AsignacionesPage from "./pages/AsignacionesPage.jsx";
import NuevaGeocerca from "./components/geocercas/NuevaGeocerca.jsx";
import TrackerPage from "./pages/TrackerPage.jsx"; // Página especial de tracker (Magic Link)
import InvitarTrackerPage from "./pages/InvitarTracker.jsx";
import Login from "./pages/Login.tsx";

import Inicio from "./pages/Inicio.jsx";
import SeleccionarOrganizacion from "./pages/SeleccionarOrganizacion.jsx";
import TrackerDashboard from "./pages/TrackerDashboard.jsx";

// Actividades + Costos
import ActividadesPage from "./pages/ActividadesPage.jsx";
import CostosPage from "./pages/CostosPage.jsx";

import { supabase } from "./supabaseClient";

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      <TopTabs />
      <main className="p-3">{children}</main>
    </div>
  );
}

function PublicShell({ children }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      <main className="p-3">{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* ROOT → /inicio */}
        <Route path="/" element={<Navigate to="/inicio" replace />} />

        {/* LOGIN (público) */}
        <Route
          path="/login"
          element={
            <PublicOnly>
              <PublicShell>
                <Login />
              </PublicShell>
            </PublicOnly>
          }
        />

        {/* SELECCIONAR ORGANIZACIÓN */}
        <Route
          path="/seleccionar-organizacion"
          element={
            <AuthGuard>
              <Shell>
                <SeleccionarOrganizacion />
              </Shell>
            </AuthGuard>
          }
        />

        {/* INICIO */}
        <Route
          path="/inicio"
          element={
            <AuthGuard>
              <Shell>
                <Inicio />
              </Shell>
            </AuthGuard>
          }
        />

        {/* NUEVA GEOCERCA */}
        <Route
          path="/nueva-geocerca"
          element={
            <AuthGuard>
              <Shell>
                <NuevaGeocerca supabaseClient={supabase} />
              </Shell>
            </AuthGuard>
          }
        />

        {/* PERSONAL */}
        <Route
          path="/personal"
          element={
            <AuthGuard>
              <Shell>
                <PersonalPage />
              </Shell>
            </AuthGuard>
          }
        />

        {/* ACTIVIDADES */}
        <Route
          path="/actividades"
          element={
            <AuthGuard>
              <Shell>
                <ActividadesPage />
              </Shell>
            </AuthGuard>
          }
        />

        {/* ASIGNACIONES */}
        <Route
          path="/asignaciones"
          element={
            <AuthGuard>
              <Shell>
                <AsignacionesPage />
              </Shell>
            </AuthGuard>
          }
        />

        {/* COSTOS */}
        <Route
          path="/costos"
          element={
            <AuthGuard>
              <Shell>
                <CostosPage />
              </Shell>
            </AuthGuard>
          }
        />

        {/* TRACKER (destino del Magic Link, sin Shell/AuthGuard) */}
        <Route path="/tracker" element={<TrackerPage />} />

        {/* TRACKER DASHBOARD */}
        <Route
          path="/tracker-dashboard"
          element={
            <AuthGuard>
              <Shell>
                <TrackerDashboard />
              </Shell>
            </AuthGuard>
          }
        />

        {/* INVITAR TRACKER (owner/admin) */}
        <Route
          path="/invitar-tracker"
          element={
            <AuthGuard>
              <Shell>
                <InvitarTrackerPage />
              </Shell>
            </AuthGuard>
          }
        />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/inicio" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
