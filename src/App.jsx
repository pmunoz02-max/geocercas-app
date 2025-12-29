// src/App.jsx
import React, { useEffect, useMemo } from "react";
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from "react-router-dom";

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
import AuthCallback from "./pages/AuthCallback";
import Inicio from "./pages/Inicio.jsx";
import Landing from "./pages/Landing.jsx";
import TrackerGpsPage from "./pages/TrackerGpsPage.jsx";
import ResetPassword from "./pages/ResetPassword.jsx";

import InstructionsPage from "./pages/help/InstructionsPage.jsx";
import FaqPage from "./pages/help/FaqPage.jsx";
import SupportPage from "./pages/help/SupportPage.jsx";
import ChangelogPage from "./pages/help/ChangelogPage.jsx";

import { useAuth } from "./context/AuthContext.jsx";

/**
 * IMPORTANT:
 * - Solo estos roles pueden ver el panel.
 * - Todo lo demás => tracker-gps (fail-closed).
 */
const PANEL_ROLES = new Set(["owner", "admin", "viewer"]);

/**
 * Cambia este string en cada deploy para confirmar en consola que cargó el build correcto.
 * (Ej: fecha/hora, o commit hash)
 */
const BUILD_TAG = "APP-ROUTER-BLINDAGE-2025-12-29-01";

function normalizeRole(r) {
  return String(r ?? "").toLowerCase().trim();
}

/**
 * Candado global anti-panel (hard redirect).
 * Si hay sesión y el rol NO está en whitelist del panel, NO permitimos rutas del panel.
 * Esto evita race conditions incluso si el router ya resolvió /inicio.
 */
function GlobalRoleRedirector() {
  const { loading, session, role } = useAuth();
  const loc = useLocation();

  useEffect(() => {
    // Solo log 1 vez por load (útil para confirmar deploy real)
    // eslint-disable-next-line no-console
    console.log("[BUILD_TAG]", BUILD_TAG);
  }, []);

  useEffect(() => {
    if (loading) return;

    const path = loc.pathname;
    const r = normalizeRole(role);

    // Rutas que SIEMPRE permitimos, aunque el rol sea raro.
    const allowAlways =
      path === "/" ||
      path === "/login" ||
      path === "/reset-password" ||
      path.startsWith("/auth/callback") ||
      path.startsWith("/tracker-gps");

    if (!session) return; // sin sesión, AuthGuard ya decide

    if (allowAlways) return;

    // Si no es rol de panel => fuera (hard replace)
    if (!PANEL_ROLES.has(r)) {
      // eslint-disable-next-line no-console
      console.warn("[GlobalRoleRedirector] BLOCK PANEL", { path, role: r });
      window.location.replace("/tracker-gps");
    }
  }, [loading, session, role, loc.pathname]);

  return null;
}

/* ======================================================
   HARD ROLE GATES (FAIL-CLOSED)
====================================================== */
function PanelGate({ children }) {
  const { loading, session, role } = useAuth();

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="px-4 py-3 rounded-xl bg-white border border-slate-200 shadow-sm text-sm text-slate-600">
          Cargando permisos…
        </div>
      </div>
    );
  }

  if (!session) return <Navigate to="/" replace />;

  const r = normalizeRole(role);

  // ✅ Whitelist: solo panel roles pasan
  if (!PANEL_ROLES.has(r)) return <Navigate to="/tracker-gps" replace />;

  return children;
}

function TrackerGate({ children }) {
  const { loading, session, role } = useAuth();

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="px-4 py-3 rounded-xl bg-white border border-slate-200 shadow-sm text-sm text-slate-600">
          Cargando permisos…
        </div>
      </div>
    );
  }

  if (!session) return <Navigate to="/" replace />;

  // Para tracker: si el rol no es de panel, lo dejamos entrar al tracker flow.
  // Esto es intencional: si role es "", "authenticated", etc., igual lo tratamos como tracker.
  const r = normalizeRole(role);
  if (PANEL_ROLES.has(r)) return <Navigate to="/inicio" replace />;

  return children;
}

/* ======================================================
   SHELL (Panel)
====================================================== */
function Shell() {
  const { loading, isRootOwner, role } = useAuth();

  const r = normalizeRole(role);

  // Defensa en profundidad (aunque PanelGate ya filtró)
  if (!loading && !PANEL_ROLES.has(r)) {
    return <Navigate to="/tracker-gps" replace />;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="px-4 py-3 rounded-xl bg-white border border-slate-200 shadow-sm text-sm text-slate-600">
          Cargando…
        </div>
      </div>
    );
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

/* ======================================================
   Smart fallback
====================================================== */
function SmartFallback() {
  const { session, loading, role } = useAuth();
  if (loading) return null;
  if (!session) return <Navigate to="/" replace />;

  const r = normalizeRole(role);

  // Whitelist: panel roles -> /inicio, todo lo demás -> /tracker-gps
  return PANEL_ROLES.has(r) ? (
    <Navigate to="/inicio" replace />
  ) : (
    <Navigate to="/tracker-gps" replace />
  );
}

/* ======================================================
   ROUTES
====================================================== */
export default function App() {
  return (
    <BrowserRouter>
      {/* Candado global anti-panel */}
      <GlobalRoleRedirector />

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
              <TrackerGate>
                <TrackerGpsPage />
              </TrackerGate>
            </AuthGuard>
          }
        />

        {/* PRIVATE PANEL (whitelist) */}
        <Route
          element={
            <AuthGuard mode="panel">
              <PanelGate>
                <Outlet />
              </PanelGate>
            </AuthGuard>
          }
        >
          <Route element={<Shell />}>
            <Route path="/inicio" element={<Inicio />} />
            <Route path="/nueva-geocerca" element={<NuevaGeocerca />} />
            <Route path="/geocercas" element={<Navigate to="/nueva-geocerca" replace />} />
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

            <Route path="/help/instructions" element={<InstructionsPage />} />
            <Route path="/help/faq" element={<FaqPage />} />
            <Route path="/help/support" element={<SupportPage />} />
            <Route path="/help/changelog" element={<ChangelogPage />} />
          </Route>
        </Route>

        <Route path="*" element={<SmartFallback />} />
      </Routes>
    </BrowserRouter>
  );
}
