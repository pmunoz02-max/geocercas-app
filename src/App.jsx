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

// ✅ correos que SIEMPRE deben comportarse como OWNER
const SUPER_OWNERS = [
  "fenice.ecuador@gmail.com",
  "pmunoz02@gmail.com",
];

// ---------------------
// Layout interno (aplicación)
// ---------------------
function Shell({ children }) {
  const { currentRole, loading, organizations, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // 1) rol normalizado desde el contexto
  let normalizedRole = (currentRole || "").toLowerCase();

  // 2) fallback por organizaciones (por si currentRole viene vacío)
  if (!normalizedRole && Array.isArray(organizations) && organizations.length > 0) {
    const ownerOrg = organizations.find(
      (o) => String(o.role || "").toLowerCase() === "owner"
    );
    const adminOrg = organizations.find(
      (o) => String(o.role || "").toLowerCase() === "admin"
    );
    if (ownerOrg) normalizedRole = "owner";
    else if (adminOrg) normalizedRole = "admin";
  }

  // 3) fallback FINAL: super-owners por email (tú)
  const userEmail = (user?.email || "").toLowerCase();
  if (!normalizedRole && SUPER_OWNERS.includes(userEmail)) {
    normalizedRole = "owner";
  }

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

  // Tabs de navegación principales (con claves i18n)
  const tabs = [
    { path: "/inicio", labelKey: "app.tabs.inicio" },
    { path: "/nueva-geocerca", labelKey: "app.tabs.nuevaGeocerca" },
    { path: "/personal", labelKey: "app.tabs.personal" },
    { path: "/actividades", labelKey: "app.tabs.actividades" },
    { path: "/asignaciones", labelKey: "app.tabs.asignaciones" },
    { path: "/costos", labelKey: "app.tabs.reportes" },
    { path: "/costos-dashboard", labelKey: "app.tabs.dashboard" },
    { path: "/tracker-dashboard", labelKey: "app.tabs.tracker" },
  ];

  // Pestañas solo para owner / admin
  if (normalizedRole === "owner" || normalizedRole === "admin") {
    tabs.push({
      path: "/invitar-tracker",
      labelKey: "app.tabs.invitarTracker",
    });
  }
  if (normalizedRole === "owner") {
    tabs.push({
      path: "/admins",
      labelKey: "app.tabs.admins",
    });
  }

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

        {/* Página independiente para trackers nativos */}
        <Route path="/tracker-gps" element={<TrackerGpsPage />} />

        {/* Reset de contraseña */}
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* Rutas protegidas por AuthGuard + Shell */}
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

        {/* Auth callback y login */}
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/login" element={<LoginShell />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/inicio" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
