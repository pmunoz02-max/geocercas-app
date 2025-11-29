// src/App.jsx
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  NavLink,
  useLocation,
} from "react-router-dom";

import AuthGuard from "./components/AuthGuard.jsx";
import PublicOnly from "./components/PublicOnly.jsx";
import AppHeader from "./components/AppHeader.jsx";

// --- Páginas / componentes principales ---
import PersonalPage from "./components/personal/PersonalPage.jsx";
import AsignacionesPage from "./pages/AsignacionesPage.jsx";
import NuevaGeocerca from "./components/geocercas/NuevaGeocerca.jsx";
import GeocercasPage from "./pages/GeocercasPage.jsx"; // ⬅️ CAMBIO AQUÍ

// Actividades + Reportes (antes Costos)
import ActividadesPage from "./pages/ActividadesPage.jsx";
import CostosPage from "./pages/CostosPage.jsx";

// Módulo de Administradores
import AdminsPage from "./pages/AdminsPage.jsx";

// Tracker
import TrackerDashboard from "./pages/TrackerDashboard.jsx";

// Páginas de invitación / auth
import InvitarTrackerPage from "./pages/InvitarTrackerPage.jsx";
import Login from "./pages/Login.jsx";
import AuthCallback from "./pages/AuthCallback.jsx";
import Inicio from "./pages/Inicio.jsx";

// Contexto de auth
import { useAuth } from "./context/AuthContext.jsx";

// Top Tabs
import TopTabs from "./components/TopTabs.jsx";

function Shell({ children }) {
  const location = useLocation();
  const { currentRole } = useAuth();

  const role = currentRole || "tracker";

  const tabs = [
    { path: "/inicio", label: "Inicio" },
    { path: "/nueva-geocerca", label: "Nueva geocerca" },
    { path: "/personal", label: "Personal" },
    { path: "/actividades", label: "Actividades" },
    { path: "/asignaciones", label: "Asignaciones" },
    { path: "/costos", label: "Reportes" },
    { path: "/tracker-dashboard", label: "Tracker" },
    { path: "/invitar-tracker", label: "Invitar tracker" },
  ];

  // Solo OWNER ve Admins
  if (role === "owner") {
    tabs.push({ path: "/admins", label: "Admins" });
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <AppHeader />

      {/* Top Tabs */}
      <div className="border-b border-slate-200 bg-white">
        <TopTabs tabs={tabs} />
      </div>

      {/* Contenido principal */}
      <main className="flex-1 p-4 max-w-6xl mx-auto w-full">
        {children}
      </main>
    </div>
  );
}

function PublicShell({ children }) {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <AppHeader />
      <main className="flex-1 p-4 max-w-3xl mx-auto w-full">{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Redirección raíz */}
        <Route
          path="/"
          element={
            <AuthGuard>
              <Navigate to="/inicio" replace />
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

        {/* NUEVA GEO */}
        <Route
          path="/nueva-geocerca"
          element={
            <AuthGuard>
              <Shell>
                <NuevaGeocerca />
              </Shell>
            </AuthGuard>
          }
        />

        {/* GEO CERCAS */}
        <Route
          path="/geocercas"
          element={
            <AuthGuard>
              <Shell>
                <GeocercasPage />
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

        {/* REPORTES (antes Costos) */}
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

        {/* TRACKER */}
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

        {/* INVITAR TRACKER */}
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

        {/* ADMINS */}
        <Route
          path="/admins"
          element={
            <AuthGuard>
              <Shell>
                <AdminsPage />
              </Shell>
            </AuthGuard>
          }
        />

        {/* AUTH CALLBACK */}
        <Route path="/auth/callback" element={<AuthCallback />} />

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

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/inicio" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
