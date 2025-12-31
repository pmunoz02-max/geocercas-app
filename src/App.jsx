// src/App.jsx
import React, { useMemo, useEffect } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";

import AuthGuard from "./components/AuthGuard.jsx";
import AppHeader from "./components/AppHeader.jsx";
import TopTabs from "./components/TopTabs.jsx";

import PersonalPage from "./components/personal/PersonalPage.jsx";
import AsignacionesPage from "./pages/AsignacionesPage.jsx";
import NuevaGeocerca from "./components/geocercas/NuevaGeocerca.jsx";
import ActividadesPage from "./pages/ActividadesPage.jsx";
import CostosPage from "./pages/CostosPage.jsx";
import CostosDashboardPage from "./pages/CostosDashboardPage.jsx";
import AdminsPage from "./pages/AdminsPage.jsx";
import TrackerDashboard from "./pages/TrackerDashboard.jsx";
import InvitarTracker from "./pages/InvitarTracker.jsx";

import Login from "./pages/Login.tsx";
import AuthCallback from "./pages/AuthCallback.tsx";
import Inicio from "./pages/Inicio.jsx";
import Landing from "./pages/Landing.jsx";
import TrackerGpsPage from "./pages/TrackerGpsPage.jsx";
import ResetPassword from "./pages/ResetPassword.jsx";

import InstructionsPage from "./pages/help/InstructionsPage.jsx";
import FaqPage from "./pages/help/FaqPage.jsx";
import SupportPage from "./pages/help/SupportPage.jsx";
import ChangelogPage from "./pages/help/ChangelogPage.jsx";

import { useAuth } from "./context/AuthContext.jsx";

const PANEL_ROLES = new Set(["owner", "admin", "viewer"]);

function Loader({ label = "Cargando…" }) {
  return (
    <div className="min-h-screen flex items-center justify-center text-slate-500">
      {label}
    </div>
  );
}

function normalizeRole(r) {
  return String(r || "").toLowerCase().trim();
}

function getActiveRoleFromRolesRows(rolesRows, orgId) {
  if (!orgId) return "";
  const row = Array.isArray(rolesRows)
    ? rolesRows.find((m) => m?.org_id === orgId)
    : null;
  return normalizeRole(row?.role);
}

/* ================= DOMAIN ENFORCER =================
   - En tracker domain, fuerza /tracker-gps
   - Si llega callback con code/hash en tracker domain, lo manda a /auth/callback
*/
function DomainEnforcer() {
  const { authReady, session, trackerDomain } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!authReady) return;
    if (!trackerDomain) return;

    const { pathname, search, hash } = location;
    const hasCode = new URLSearchParams(search).has("code");
    const hasAccessToken = String(hash || "").includes("access_token=");

    // Si viene callback pero no está en /auth/callback, redirige ahí
    if ((hasCode || hasAccessToken) && pathname !== "/auth/callback") {
      navigate(`/auth/callback${search}${hash}`, { replace: true });
      return;
    }

    const publicAllowed = new Set([
      "/",
      "/login",
      "/reset-password",
      "/auth/callback",
      "/tracker-gps",
    ]);

    if (!session && !publicAllowed.has(pathname)) {
      navigate("/", { replace: true });
      return;
    }

    if (session && pathname !== "/tracker-gps") {
      navigate("/tracker-gps", { replace: true });
    }
  }, [authReady, session, location, navigate, trackerDomain]);

  return null;
}

/* ================= PANEL GATE =================
   - Jamás loader infinito
   - Si no hay rol => tarjeta de error (NO loader)
*/
function PanelGate({ children }) {
  const { authReady, authError, session, currentRole, trackerDomain } = useAuth();
  const location = useLocation();

  // Nunca bloquear AuthCallback
  if (location.pathname === "/auth/callback") return children;

  // Dominio tracker nunca entra al panel
  if (trackerDomain) {
    return <Navigate to="/tracker-gps" replace />;
  }

  // Espera controlada
  if (!authReady) return <Loader label="Validando sesión…" />;

  // No autenticado => landing
  if (!session) return <Navigate to="/" replace />;

  // Sin rol => ERROR visible (no loader infinito)
  if (!currentRole) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="w-full max-w-xl rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm">
          <div className="text-sm font-semibold text-red-800">
            Error de permisos
          </div>
          <div className="mt-2 text-sm text-red-700">
            Tu cuenta no tiene un rol asignado para el panel.
          </div>
          <div className="mt-3 text-xs text-red-600">
            {authError || "Verifica invitación, organización o RLS en app_user_roles."}
          </div>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => window.location.reload()}
              className="rounded-xl bg-red-700 px-3 py-2 text-xs font-semibold text-white hover:bg-red-600"
            >
              Reintentar
            </button>
            <button
              onClick={() => (window.location.href = "/login")}
              className="rounded-xl border border-red-300 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50"
            >
              Volver a Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Rol válido pero no panel
  if (!PANEL_ROLES.has(currentRole)) {
    return <Navigate to="/tracker-gps" replace />;
  }

  return children;
}

/* ================= SHELL ================= */
function Shell() {
  const { authReady, roles, currentOrg, isRootOwner, currentRole } = useAuth();
  const activeOrgId = currentOrg?.id ?? null;

  const activeRole = useMemo(
    () => getActiveRoleFromRolesRows(roles, activeOrgId),
    [roles, activeOrgId]
  );

  if (!authReady) return <Loader label="Cargando panel…" />;

  const roleLower = normalizeRole(currentRole || activeRole);
  if (!roleLower) return <Loader label="Preparando entorno…" />;

  if (!PANEL_ROLES.has(roleLower)) {
    return <Navigate to="/tracker-gps" replace />;
  }

  const tabs = [
    { path: "/inicio", labelKey: "app.tabs.inicio" },
    { path: "/nueva-geocerca", labelKey: "app.tabs.nuevaGeocerca" },
    { path: "/personal", labelKey: "app.tabs.personal" },
    { path: "/actividades", labelKey: "app.tabs.actividades" },
    { path: "/asignaciones", labelKey: "app.tabs.asignaciones" },
    { path: "/costos", labelKey: "app.tabs.reportes" },
    { path: "/costos-dashboard", labelKey: "app.tabs.dashboard" },
    { path: "/tracker-dashboard", labelKey: "app.tabs.tracker" },
    { path: "/invitar-tracker", labelKey: "app.tabs.invitarTracker" },
  ];

  if (isRootOwner) {
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

/* ================= FALLBACK ================= */
function SmartFallback() {
  const { session, authReady, currentRole, trackerDomain } = useAuth();
  if (!authReady) return <Loader />;

  if (trackerDomain) {
    return session ? (
      <Navigate to="/tracker-gps" replace />
    ) : (
      <Navigate to="/" replace />
    );
  }

  if (!session) return <Navigate to="/" replace />;

  const r = normalizeRole(currentRole);
  if (!r) return <Loader />;

  return PANEL_ROLES.has(r) ? (
    <Navigate to="/inicio" replace />
  ) : (
    <Navigate to="/tracker-gps" replace />
  );
}

/* ================= APP ================= */
export default function App() {
  return (
    <BrowserRouter>
      <DomainEnforcer />

      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/auth/callback" element={<AuthCallback />} />

        <Route
          path="/tracker-gps"
          element={
            <AuthGuard mode="tracker">
              <TrackerGpsPage />
            </AuthGuard>
          }
        />

        <Route
          element={
            <AuthGuard mode="panel">
              <PanelGate>
                <Shell />
              </PanelGate>
            </AuthGuard>
          }
        >
          <Route path="/inicio" element={<Inicio />} />
          <Route path="/nueva-geocerca" element={<NuevaGeocerca />} />
          <Route path="/personal" element={<PersonalPage />} />
          <Route path="/actividades" element={<ActividadesPage />} />
          <Route path="/asignaciones" element={<AsignacionesPage />} />
          <Route path="/costos" element={<CostosPage />} />
          <Route path="/costos-dashboard" element={<CostosDashboardPage />} />
          <Route path="/tracker-dashboard" element={<TrackerDashboard />} />
          <Route path="/invitar-tracker" element={<InvitarTracker />} />
          <Route path="/admins" element={<AdminsPage />} />

          <Route path="/help/instructions" element={<InstructionsPage />} />
          <Route path="/help/faq" element={<FaqPage />} />
          <Route path="/help/support" element={<SupportPage />} />
          <Route path="/help/changelog" element={<ChangelogPage />} />
        </Route>

        <Route path="*" element={<SmartFallback />} />
      </Routes>
    </BrowserRouter>
  );
}
