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

import { useAuth } from "./context/AuthContext.jsx";
import TopTabs from "./components/TopTabs.jsx";

import ProtectedRoute from "./auth/ProtectedRoute.jsx";
import { MODULE_KEYS, canAccessModule } from "./lib/permissions";

// ---------------------
// Layout interno (aplicación)
// ---------------------
function Shell({ children }) {
  const { currentRole, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const normalizedRole = (currentRole || "").toLowerCase();
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

  // Si es tracker, lo mandamos siempre a /tracker-gps
  useEffect(() => {
    if (treatAsTracker && location.pathname !== "/tracker-gps") {
      navigate("/tracker-gps", { replace: true });
    }
  }, [treatAsTracker, location.pathname, navigate]);

  if (treatAsTracker && location.pathname !== "/tracker-gps") {
    return null;
  }

  const role = normalizedRole;

  // Config de pestañas con módulo asociado
  const tabsConfig = [
    {
      path: "/inicio",
      labelKey: "app.tabs.inicio",
      moduleKey: MODULE_KEYS.INICIO,
    },
    {
      path: "/nueva-geocerca",
      labelKey: "app.tabs.nuevaGeocerca",
      moduleKey: MODULE_KEYS.GEOCERCAS,
    },
    {
      path: "/personal",
      labelKey: "app.tabs.personal",
      moduleKey: MODULE_KEYS.PERSONAL,
    },
    {
      path: "/actividades",
      labelKey: "app.tabs.actividades",
      moduleKey: MODULE_KEYS.ACTIVIDADES,
    },
    {
      path: "/asignaciones",
      labelKey: "app.tabs.asignaciones",
      moduleKey: MODULE_KEYS.ASIGNACIONES,
    },
    {
      path: "/costos",
      labelKey: "app.tabs.reportes",
      moduleKey: MODULE_KEYS.REPORTES_COSTOS,
    },
    {
      path: "/costos-dashboard",
      labelKey: "app.tabs.dashboard",
      moduleKey: MODULE_KEYS.DASHBOARD_COSTOS,
    },
    {
      path: "/tracker-dashboard",
      labelKey: "app.tabs.tracker",
      moduleKey: MODULE_KEYS.TRACKER,
    },
    {
      path: "/invitar-tracker",
      labelKey: "app.tabs.invitarTracker",
      moduleKey: MODULE_KEYS.INVITAR_TRACKER,
    },
    {
      path: "/admins",
      labelKey: "app.tabs.admins",
      moduleKey: MODULE_KEYS.ADMINS,
    },
  ];

  // SOLO mostramos las pestañas que el rol actual puede ver
  const tabs = tabsConfig.filter((tab) =>
    canAccessModule(role, tab.moduleKey)
  );

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
// Layout LOGIN
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

        {/* Página de tracker web protegida */}
        <Route
          path="/tracker-gps"
          element={
            <AuthGuard>
              <ProtectedRoute moduleKey={MODULE_KEYS.TRACKER}>
                <Shell>
                  <TrackerGpsPage />
                </Shell>
              </ProtectedRoute>
            </AuthGuard>
          }
        />

        {/* Reset de contraseña */}
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* Rutas protegidas por AuthGuard + Shell + permisos por módulo */}
        <Route
          path="/inicio"
          element<
            AuthGuard>
            <ProtectedRoute moduleKey={MODULE_KEYS.INICIO}>
              <Shell>
                <Inicio />
              </Shell>
            </ProtectedRoute>
          }
        />

        <Route
          path="/nueva-geocerca"
          element={
            <AuthGuard>
              <ProtectedRoute moduleKey={MODULE_KEYS.GEOCERCAS}>
                <Shell>
                  <NuevaGeocerca />
                </Shell>
              </ProtectedRoute>
            </AuthGuard>
          }
        />

        <Route
          path="/geocercas"
          element={
            <AuthGuard>
              <ProtectedRoute moduleKey={MODULE_KEYS.GEOCERCAS}>
                <Shell>
                  <GeocercasPage />
                </Shell>
              </ProtectedRoute>
            </AuthGuard>
          }
        />

        <Route
          path="/personal"
          element={
            <AuthGuard>
              <ProtectedRoute moduleKey={MODULE_KEYS.PERSONAL}>
                <Shell>
                  <PersonalPage />
                </Shell>
              </ProtectedRoute>
            </AuthGuard>
          }
        />

        <Route
          path="/actividades"
          element={
            <AuthGuard>
              <ProtectedRoute moduleKey={MODULE_KEYS.ACTIVIDADES}>
                <Shell>
                  <ActividadesPage />
                </Shell>
              </ProtectedRoute>
            </AuthGuard>
          }
        />

        <Route
          path="/asignaciones"
          element={
            <AuthGuard>
              <ProtectedRoute moduleKey={MODULE_KEYS.ASIGNACIONES}>
                <Shell>
                  <AsignacionesPage />
                </Shell>
              </ProtectedRoute>
            </AuthGuard>
          }
        />

        <Route
          path="/costos"
          element={
            <AuthGuard>
              <ProtectedRoute moduleKey={MODULE_KEYS.REPORTES_COSTOS}>
                <Shell>
                  <CostosPage />
                </Shell>
              </ProtectedRoute>
            </AuthGuard>
          }
        />

        <Route
          path="/costos-dashboard"
          element={
            <AuthGuard>
              <ProtectedRoute moduleKey={MODULE_KEYS.DASHBOARD_COSTOS}>
                <Shell>
                  <CostosDashboardPage />
                </Shell>
              </ProtectedRoute>
            </AuthGuard>
          }
        />

        <Route
          path="/tracker-dashboard"
          element={
            <AuthGuard>
              <ProtectedRoute moduleKey={MODULE_KEYS.TRACKER}>
                <Shell>
                  <TrackerDashboard />
                </Shell>
              </ProtectedRoute>
            </AuthGuard>
          }
        />

        <Route
          path="/invitar-tracker"
          element={
            <AuthGuard>
              <ProtectedRoute moduleKey={MODULE_KEYS.INVITAR_TRACKER}>
                <Shell>
                  <InvitarTracker />
                </Shell>
              </ProtectedRoute>
            </AuthGuard>
          }
        />

        <Route
          path="/admins"
          element={
            <AuthGuard>
              <ProtectedRoute moduleKey={MODULE_KEYS.ADMINS}>
                <Shell>
                  <AdminsPage />
                </Shell>
              </ProtectedRoute>
            </AuthGuard>
          }
        />

        {/* Auth callback y login */}
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/login" element={<LoginShell />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/inicio" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
