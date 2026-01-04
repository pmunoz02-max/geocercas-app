// src/App.jsx
// GOLD CLEAN — stable (NO useMemo, NO activeRole)

import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";

import { useAuth } from "./context/AuthContext.jsx";
import AuthGuard from "./components/AuthGuard.jsx";
import AppHeader from "./components/AppHeader.jsx";
import TopTabs from "./components/TopTabs.jsx";

/* Public */
import Landing from "./pages/Landing.jsx";
import Login from "./pages/Login.tsx";
import ResetPassword from "./pages/ResetPassword.jsx";
import AuthCallback from "./pages/AuthCallback";
import Inicio from "./pages/Inicio.jsx";

/* Panel */
import NuevaGeocerca from "./components/geocercas/NuevaGeocerca.jsx";
import GeocercasPage from "./pages/GeocercasPage.jsx";
import PersonalPage from "./components/personal/PersonalPage.jsx";
import ActividadesPage from "./pages/ActividadesPage.jsx";
import AsignacionesPage from "./pages/AsignacionesPage.jsx";
import CostosPage from "./pages/CostosPage.jsx";
import CostosDashboardPage from "./pages/CostosDashboardPage.jsx";
import TrackerDashboard from "./pages/TrackerDashboard.jsx";
import InvitarTracker from "./pages/InvitarTracker.jsx";
import AdminsPage from "./pages/AdminsPage.jsx";

/* Tracker */
import TrackerGpsPage from "./pages/TrackerGpsPage.jsx";

/* Help */
import InstructionsPage from "./pages/help/InstructionsPage.jsx";
import FaqPage from "./pages/help/FaqPage.jsx";
import SupportPage from "./pages/help/SupportPage.jsx";
import ChangelogPage from "./pages/help/ChangelogPage.jsx";

/* =========================
   HELPERS
========================= */
function normalizeRole(r) {
  const v = String(r || "").toLowerCase();
  if (v === "owner") return "owner";
  if (v === "admin") return "admin";
  if (v === "viewer") return "viewer";
  if (v === "tracker") return "tracker";
  return "tracker";
}

const PANEL_ROLES = new Set(["owner", "admin", "viewer"]);

/* =========================
   UI
========================= */
function FullScreenLoader({ text = "Cargando…" }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="px-4 py-3 rounded-xl bg-white border border-slate-200 shadow-sm text-sm text-slate-600">
        {text}
      </div>
    </div>
  );
}

/* =========================
   GATES (ÚNICA AUTORIDAD)
========================= */
function RequirePanel({ children }) {
  const { loading, session, role } = useAuth();

  if (loading) return <FullScreenLoader text="Cargando organización y permisos…" />;
  if (!session) return <Navigate to="/" replace />;

  const r = normalizeRole(role);
  if (!PANEL_ROLES.has(r)) return <Navigate to="/tracker-gps" replace />;

  return children;
}

function RequireTracker({ children }) {
  const { loading, session, role } = useAuth();

  if (loading) return <FullScreenLoader text="Cargando autenticación…" />;
  if (!session) return <Navigate to="/login" replace />;

  const r = normalizeRole(role);
  if (r !== "tracker") return <Navigate to="/inicio" replace />;

  return children;
}

/* =========================
   PANEL SHELL
========================= */
function Shell() {
  const { loading, isRootOwner } = useAuth();

  if (loading) return <FullScreenLoader text="Cargando organización y permisos…" />;

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

  if (isRootOwner === true) {
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

function RootOwnerRoute({ children }) {
  const { loading, isRootOwner } = useAuth();
  if (loading) return null;
  if (!isRootOwner) return <Navigate to="/inicio" replace />;
  return children;
}

function LoginShell() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <Login />
    </div>
  );
}

/* =========================
   SMART FALLBACK
========================= */
function SmartFallback() {
  const { loading, session, role } = useAuth();
  if (loading) return null;
  if (!session) return <Navigate to="/" replace />;

  const r = normalizeRole(role);
  return r === "tracker" ? (
    <Navigate to="/tracker-gps" replace />
  ) : (
    <Navigate to="/inicio" replace />
  );
}

/* =========================
   ROUTES
========================= */
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* PUBLIC */}
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<LoginShell />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/auth/callback" element={<AuthCallback />} />

        {/* TRACKER */}
        <Route
          path="/tracker-gps"
          element={
            <AuthGuard mode="tracker">
              <RequireTracker>
                <TrackerGpsPage />
              </RequireTracker>
            </AuthGuard>
          }
        />

        {/* PANEL + HELP (NO lo borres ni lo edites por partes) */}
        <Route
          element={
            <AuthGuard mode="panel">
              <RequirePanel>
                <Shell />
              </RequirePanel>
            </AuthGuard>
          }
        >
          <Route path="/inicio" element={<Inicio />} />
          <Route path="/nueva-geocerca" element={<NuevaGeocerca />} />
          <Route path="/geocercas" element={<GeocercasPage />} />
          <Route path="/personal" element={<PersonalPage />} />
          <Route path="/actividades" element={<ActividadesPage />} />
          <Route path="/asignaciones" element={<AsignacionesPage />} />
          <Route path="/costos" element={<CostosPage />} />
          <Route path="/costos-dashboard" element={<CostosDashboardPage />} />
          <Route path="/tracker-dashboard" element={<TrackerDashboard />} />
          <Route path="/invitar-tracker" element={<InvitarTracker />} />

          <Route
            path="/admins"
            element={
              <RootOwnerRoute>
                <AdminsPage />
              </RootOwnerRoute>
            }
          />

          {/* HELP */}
          <Route path="/help/instructions" element={<InstructionsPage />} />
          <Route path="/help/faq" element={<FaqPage />} />
          <Route path="/help/support" element={<SupportPage />} />
          <Route path="/help/changelog" element={<ChangelogPage />} />
        </Route>

        {/* FALLBACK */}
        <Route path="*" element={<SmartFallback />} />
      </Routes>
    </BrowserRouter>
  );
}
