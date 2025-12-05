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
import CostosDashboardPage from "./pages/CostosDashboardPage.jsx";

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

// Reset de contraseña
import ResetPassword from "./pages/ResetPassword.jsx";

// Contexto de auth
import { useAuth } from "./context/AuthContext.jsx";

// Top Tabs
import TopTabs from "./components/TopTabs.jsx";

// ---------------------
// Layout interno (app)
// ---------------------
function Shell({ children }) {
  const { currentRole, loading, organizations } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const normalizedRole = (currentRole || "").toLowerCase();
  const hasOrgs = Array.isArray(organizations) && organizations.length > 0;

  // SOLO rol "tracker" se trata como tracker.
  const treatAsTracker = normalizedRole === "tracker";

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="px-4 py-3 rounded-xl bg-white border border-slate-200 shadow-sm text-sm text-slate-600">
          Cargando tu sesión…
        </div>
      </div>
    );
  }

  useEffect(() => {
    if (treatAsTracker && location.pathname !== "/tracker-gps") {
      navigate("/tracker-gps", { replace: true });
    }
  }, [treatAsTracker, location.pathname, navigate]);

  if (treatAsTracker && location.pathname !== "/tracker-gps") {
    return null;
  }

  const tabs = [
    { path: "/inicio", label: "Inicio" },
    { path: "/nueva-geocerca", label: "Nueva geocerca" },
    { path: "/personal", label: "Personal" },
    { path: "/actividades", label: "Actividades" },
    { path: "/asignaciones", label: "Asignaciones" },
    { path: "/costos", label: "Reportes" },
    { path: "/costos-dashboard", label: "Dashboard" },
    { path: "/tracker-dashboard", label: "Tracker" },
  ];

  if (normalizedRole === "owner" || normalizedRole === "admin") {
    tabs.push({ path: "/invitar-tracker", label: "Invitar tracker" });
  }

  if (normalizedRole === "owner") {
    tabs.push({ path: "/admins", label: "Admins" });
  }

  // hasOrgs lo usamos luego si quieres lógicas adicionales
  // console.log("hasOrgs", hasOrgs);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <AppHeader />

      <div className="border-b border-slate-200 bg-white">
        <TopTabs tabs={tabs} />
      </div>

      <main className="flex-1 p-4 max-w-6xl mx-auto w-full">{children}</main>
    </div>
  );
}

// ---------------------
// Layout de LOGIN
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
        {/* Landing pública */}
        <Route path="/" element={<Landing />} />

        {/* Tracker GPS (magic link) */}
        <Route path="/tracker-gps" element={<TrackerGpsPage />} />

        {/* Reset password */}
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* Inicio */}
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

        {/* Nueva geocerca */}
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

        {/* Geocercas */}
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

        {/* Personal */}
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

        {/* Actividades */}
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

        {/* Asignaciones */}
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

        {/* Reportes */}
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

        {/* Dashboard de costos */}
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

        {/* Tracker dashboard (admin/owner) */}
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

        {/* Invitar tracker */}
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

        {/* Admins */}
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

        {/* Callback de auth (Magic link) */}
        <Route path="/auth/callback" element={<AuthCallback />} />

        {/* Login */}
        <Route path="/login" element={<LoginShell />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/inicio" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
