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

// Módulo de Administradores
import AdminsPage from "./pages/AdminsPage.jsx";

// Callback de autenticación (Magic Link / OAuth)
import AuthCallback from "./pages/AuthCallback.jsx";

import { supabase } from "./supabaseClient";
import { useAuth } from "./context/AuthContext";

// ----------------------
// Tabs dentro de App.jsx
// ----------------------
function TabsNav() {
  const location = useLocation();
  const { profile, currentRole } = useAuth();

  const role = (currentRole || profile?.role || "").toLowerCase();

  const tabs = [
    { path: "/inicio", label: "Inicio" },
    { path: "/nueva-geocerca", label: "Nueva geocerca" },
    { path: "/personal", label: "Personal" },
    { path: "/actividades", label: "Actividades" },
    { path: "/asignaciones", label: "Asignaciones" },
    { path: "/costos", label: "Costos" },
    { path: "/tracker", label: "Tracker" },
    { path: "/invitar-tracker", label: "Invitar tracker" },
  ];

  // 👉 Solo OWNER ve la pestaña Admins
  if (role === "owner") {
    tabs.push({ path: "/admins", label: "Admins" });
  }

  const isActive = (path) => location.pathname === path;

  const baseClasses =
    "inline-flex items-center whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-colors border";
  const activeClasses = "bg-blue-600 text-white border-blue-600 shadow-sm";
  const inactiveClasses =
    "bg-white text-slate-600 border-slate-200 hover:bg-slate-50";

  return (
    <div className="border-b border-slate-200 bg-white/80 backdrop-blur sticky top-0 z-20">
      <div className="max-w-7xl mx-auto px-3 py-2 flex flex-wrap items-center gap-2">
        {tabs.map((tab) => (
          <NavLink
            key={tab.path}
            to={tab.path}
            className={`${baseClasses} ${
              isActive(tab.path) ? activeClasses : inactiveClasses
            }`}
          >
            {tab.label}
          </NavLink>
        ))}
      </div>
    </div>
  );
}

// Shell privado: header + tabs + contenido
function Shell({ children }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      <TabsNav />
      <main className="p-3">{children}</main>
    </div>
  );
}

// Shell público: solo header + contenido
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

        {/* CALLBACK de autenticación (Magic Link / OAuth) */}
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

        {/* ADMINISTRADORES (protegido, pero la visibilidad de pestaña la maneja TabsNav) */}
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
