// src/App.jsx
import { useEffect } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";

import AuthGuard from "./components/AuthGuard.jsx";
import AppHeader from "./components/AppHeader.jsx";

// --- Páginas / componentes principales ---
import PersonalPage from "./components/personal/PersonalPage.jsx";
import AsignacionesPage from "./pages/AsignacionesPage.jsx";
import NuevaGeocerca from "./components/geocercas/NuevaGeocerca.jsx";
import GeocercasPage from "./pages/GeocercasPage.jsx";

// Actividades + Reportes (antes Costos)
import ActividadesPage from "./pages/ActividadesPage.jsx";
import CostosPage from "./pages/CostosPage.jsx";
import CostosDashboardPage from "./pages/CostosDashboardPage.jsx"; // ⬅ NUEVO

// Módulo de Administradores
import AdminsPage from "./pages/AdminsPage.jsx";

// Tracker (dashboard normal)
import TrackerDashboard from "./pages/TrackerDashboard.jsx";

// Invitación de trackers
import InvitarTracker from "./pages/InvitarTracker.jsx";

// Auth
import Login from "./pages/Login.tsx";
import AuthCallback from "./pages/AuthCallback";

// Dashboard interno
import Inicio from "./pages/Inicio.jsx";

// Nueva landing pública
import Landing from "./pages/Landing.jsx";

// Página ESPECIAL de tracker-only GPS
import TrackerGpsPage from "./pages/TrackerGpsPage.jsx";

// 🔐 Nueva página de reset de contraseña
import ResetPassword from "./pages/ResetPassword.jsx";

// Contexto de auth
import { useAuth } from "./context/AuthContext.jsx";

// Top Tabs
import TopTabs from "./components/TopTabs.jsx";

// ---------------------
// Layout interno (app)
// ---------------------
function Shell({ children }) {
  const { currentRole, loading, organizations, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const normalizedRole = (currentRole || "").toLowerCase();
  const hasOrgs = Array.isArray(organizations) && organizations.length > 0;

  // 💡 Regla de oro:
  // - Si el rol es "tracker" → tracker
  // - Si NO hay organizaciones pero sí hay usuario → también lo tratamos como tracker
  const treatAsTracker =
    normalizedRole === "tracker" || (!!user && !hasOrgs && !normalizedRole);

  // Mientras el AuthContext está cargando, no mostramos nada “real”
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="px-4 py-3 rounded-xl bg-white border border-slate-200 shadow-sm text-sm text-slate-600">
          Cargando tu sesión…
        </div>
      </div>
    );
  }

  // 🚧 BLOQUEO DURO:
  // Si el usuario debe ser tratado como tracker y está en cualquier ruta del panel,
  // lo mandamos a /tracker-gps y NO mostramos el panel.
  useEffect(() => {
    if (treatAsTracker && location.pathname !== "/tracker-gps") {
      navigate("/tracker-gps", { replace: true });
    }
  }, [treatAsTracker, location.pathname, navigate]);

  if (treatAsTracker && location.pathname !== "/tracker-gps") {
    // Mientras redirigimos, no mostramos nada del Shell (ni header ni tabs)
    return null;
  }

  // Tabs base visibles solo para usuarios que NO son trackers
  const tabs = [
    { path: "/inicio", label: "Inicio" },
    { path: "/nueva-geocerca", label: "Nueva geocerca" },
    { path: "/personal", label: "Personal" },
    { path: "/actividades", label: "Actividades" },
    { path: "/asignaciones", label: "Asignaciones" },
    { path: "/costos", label: "Reportes" },
    { path: "/costos-dashboard", label: "Dashboard" }, // ⬅ NUEVO TAB
    { path: "/tracker-dashboard", label: "Tracker" },
  ];

  // Solo owner / admin pueden invitar trackers
  if (normalizedRole === "owner" || normalizedRole === "admin") {
    tabs.push({ path: "/invitar-tracker", label: "Invitar tracker" });
  }

  // Solo owner ve la pestaña de Admins
  if (normalizedRole === "owner") {
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
      <main className="flex-1 p-4 max-w-6xl mx-auto w-full">{children}</main>
    </div>
  );
}

// ---------------------
// Layout de LOGIN
// (SIN AppHeader)
// ---------------------
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
        {/* 🔓 RUTA PÚBLICA PRINCIPAL: Landing */}
        <Route path="/" element={<Landing />} />

        {/* ⭐⭐⭐ RUTA ESPECIAL PARA TRACKERS (Magic Link) */}
        <Route path="/tracker-gps" element={<TrackerGpsPage />} />

        {/* 🔐 RUTA PÚBLICA PARA RESET DE CONTRASEÑA (admins y trackers) */}
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* INICIO (dashboard interno) */}
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

        {/* REPORTES */}
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

        {/* DASHBOARD DE COSTOS (GRÁFICOS) */}
        <Route
          path="/costos-dashboard"
          element={
            <AuthGuard>
              <Shell>
                <CostosDashboardPage />
              </Shell>
            </AuthGuard>
          }
        />

        {/* TRACKER DASHBOARD NORMAL (solo admins/owners, nunca trackers con esta lógica) */}
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
                <InvitarTracker />
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

        {/* AUTH CALLBACK (Magic Link) */}
        <Route path="/auth/callback" element={<AuthCallback />} />

        {/* LOGIN: pantalla aislada, sin AppHeader */}
        <Route path="/login" element={<LoginShell />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/inicio" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
