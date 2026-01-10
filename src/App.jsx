// src/App.jsx
import React from "react";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";

import AuthGuard from "./components/AuthGuard.jsx";
import AppHeader from "./components/AppHeader.jsx";
import TopTabs from "./components/TopTabs.jsx";

import RequireOrg from "./components/org/RequireOrg.jsx";

import Landing from "./pages/Landing.jsx";
import Login from "./pages/Login.tsx";
import ResetPassword from "./pages/ResetPassword.jsx";
import AuthCallback from "./pages/AuthCallback.tsx";
import InviteCallback from "./pages/InviteCallback.tsx";

import Inicio from "./pages/Inicio.jsx";
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

import TrackerGpsPage from "./pages/TrackerGpsPage.jsx";

import InstructionsPage from "./pages/help/InstructionsPage.jsx";
import FaqPage from "./pages/help/FaqPage.jsx";
import SupportPage from "./pages/help/SupportPage.jsx";
import ChangelogPage from "./pages/help/ChangelogPage.jsx";

import { useAuth } from "./context/AuthContext.jsx";

/** =========================
 * Helpers
 * ========================= */
function toSafeString(x) {
  if (x == null) return "";
  if (typeof x === "string") return x;
  if (typeof x === "number" || typeof x === "boolean") return String(x);
  try {
    return JSON.stringify(x);
  } catch {
    return String(x);
  }
}

/** =========================
 * Global Error Boundary (airbag)
 * ========================= */
class GlobalErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: "", stack: "" };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, message: toSafeString(error?.message || error) };
  }
  componentDidCatch(error, info) {
    const componentStack = info?.componentStack || "";
    console.error("[GlobalErrorBoundary] Caught error:", error);
    console.error("[GlobalErrorBoundary] Component stack:", componentStack);
    this.setState({ stack: componentStack });
  }
  handleReload = () => window.location.reload();
  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="w-full max-w-4xl bg-white border border-red-200 rounded-2xl shadow-sm p-5">
          <h1 className="text-lg font-semibold text-red-700">Error de render (capturado)</h1>
          <p className="text-sm text-slate-700 mt-2">
            Copia este bloque y pégalo en el chat:
          </p>
          <div className="mt-4 text-xs bg-slate-50 border rounded-xl p-3 space-y-2">
            <div>
              <b>MESSAGE:</b> <span className="font-mono break-all">{this.state.message}</span>
            </div>
            {this.state.stack ? (
              <div>
                <b>COMPONENT STACK:</b>
                <pre className="mt-1 font-mono whitespace-pre-wrap break-words">{this.state.stack}</pre>
              </div>
            ) : null}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={this.handleReload} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm">
              Recargar
            </button>
            <a href="/" className="px-4 py-2 rounded-xl border border-slate-300 text-sm">
              Ir al Landing
            </a>
          </div>
          <p className="text-[11px] text-slate-500 mt-4">
            Este airbag es temporal: sirve para localizar el componente que está intentando renderizar un objeto como texto.
          </p>
        </div>
      </div>
    );
  }
}

/** =========================
 * Component Boundary (para localizar EXACTAMENTE qué bloque cae)
 * ========================= */
class ComponentBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: "", stack: "" };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, message: toSafeString(error?.message || error) };
  }
  componentDidCatch(error, info) {
    const componentStack = info?.componentStack || "";
    console.error(`[ComponentBoundary:${this.props.name}] Caught error:`, error);
    console.error(`[ComponentBoundary:${this.props.name}] Component stack:`, componentStack);
    this.setState({ stack: componentStack });
  }
  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="w-full border border-amber-300 bg-amber-50 rounded-xl p-3 text-xs text-amber-900">
        <div className="font-semibold">Bloque con error: {this.props.name}</div>
        <div className="mt-1">
          <b>MESSAGE:</b> <span className="font-mono break-all">{this.state.message}</span>
        </div>
        {this.state.stack ? (
          <details className="mt-2">
            <summary className="cursor-pointer">Ver stack</summary>
            <pre className="mt-1 font-mono whitespace-pre-wrap break-words">{this.state.stack}</pre>
          </details>
        ) : null}
        <div className="mt-2 text-[11px] text-amber-800">
          Solución típica: se está intentando renderizar un objeto (ej. &#123;error&#125;) o i18n devuelve objeto. Convierte a string con JSON.stringify o safeText().
        </div>
      </div>
    );
  }
}

function FullScreenLoader({ text = "Cargando..." }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="px-4 py-3 rounded-xl bg-white border border-slate-200 shadow-sm text-sm text-slate-600">
        {text}
      </div>
    </div>
  );
}

function RequirePanel({ children }) {
  const { loading, session, bestRole } = useAuth();
  if (loading) return <FullScreenLoader text="Cargando sesión…" />;
  if (!session) return <Navigate to="/" replace />;

  const isTracker = String(bestRole || "").toLowerCase() === "tracker";
  if (isTracker) return <Navigate to="/tracker-gps" replace />;

  return children;
}

function RequireTracker({ children }) {
  const { loading, session, bestRole } = useAuth();
  if (loading) return <FullScreenLoader text="Cargando sesión…" />;
  if (!session) return <Navigate to="/login" replace />;

  const isTracker = String(bestRole || "").toLowerCase() === "tracker";
  if (!isTracker) return <Navigate to="/inicio" replace />;

  return children;
}

function RootOwnerRoute({ children }) {
  const { loading, isRootOwner } = useAuth();
  if (loading) return <FullScreenLoader text="Cargando permisos…" />;
  if (!isRootOwner) return <Navigate to="/inicio" replace />;
  return children;
}

function LoginShell() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <ComponentBoundary name="Login">
        <Login />
      </ComponentBoundary>
    </div>
  );
}

function SmartFallback() {
  const { loading, session, bestRole } = useAuth();
  if (loading) return <FullScreenLoader text="Cargando…" />;
  if (!session) return <Navigate to="/" replace />;
  const isTracker = String(bestRole || "").toLowerCase() === "tracker";
  return isTracker ? <Navigate to="/tracker-gps" replace /> : <Navigate to="/inicio" replace />;
}

function Shell() {
  const { isRootOwner } = useAuth();

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
      <ComponentBoundary name="AppHeader">
        <AppHeader />
      </ComponentBoundary>

      <div className="border-b border-slate-200 bg-white">
        <ComponentBoundary name="TopTabs">
          <TopTabs tabs={tabs} />
        </ComponentBoundary>
      </div>

      <main className="flex-1 p-4 max-w-6xl mx-auto w-full">
        <ComponentBoundary name="Outlet (Page)">
          <Outlet />
        </ComponentBoundary>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <GlobalErrorBoundary>
        <Routes>
          <Route
            path="/"
            element={
              <ComponentBoundary name="Landing">
                <Landing />
              </ComponentBoundary>
            }
          />

          <Route path="/login" element={<LoginShell />} />
          <Route
            path="/reset-password"
            element={
              <ComponentBoundary name="ResetPassword">
                <ResetPassword />
              </ComponentBoundary>
            }
          />

          <Route
            path="/auth/callback"
            element={
              <ComponentBoundary name="AuthCallback">
                <AuthCallback />
              </ComponentBoundary>
            }
          />
          <Route
            path="/auth/invite"
            element={
              <ComponentBoundary name="InviteCallback">
                <InviteCallback />
              </ComponentBoundary>
            }
          />

          <Route
            path="/tracker-gps"
            element={
              <AuthGuard mode="tracker">
                <RequireTracker>
                  <ComponentBoundary name="TrackerGpsPage">
                    <TrackerGpsPage />
                  </ComponentBoundary>
                </RequireTracker>
              </AuthGuard>
            }
          />

          <Route
            element={
              <AuthGuard mode="panel">
                <RequirePanel>
                  <Shell />
                </RequirePanel>
              </AuthGuard>
            }
          >
            <Route
              path="/inicio"
              element={
                <RequireOrg>
                  <ComponentBoundary name="Inicio">
                    <Inicio />
                  </ComponentBoundary>
                </RequireOrg>
              }
            />
            <Route
              path="/nueva-geocerca"
              element={
                <RequireOrg>
                  <ComponentBoundary name="NuevaGeocerca">
                    <NuevaGeocerca />
                  </ComponentBoundary>
                </RequireOrg>
              }
            />
            <Route
              path="/geocercas"
              element={
                <RequireOrg>
                  <ComponentBoundary name="GeocercasPage">
                    <GeocercasPage />
                  </ComponentBoundary>
                </RequireOrg>
              }
            />
            <Route
              path="/personal"
              element={
                <RequireOrg>
                  <ComponentBoundary name="PersonalPage">
                    <PersonalPage />
                  </ComponentBoundary>
                </RequireOrg>
              }
            />
            <Route
              path="/actividades"
              element={
                <RequireOrg>
                  <ComponentBoundary name="ActividadesPage">
                    <ActividadesPage />
                  </ComponentBoundary>
                </RequireOrg>
              }
            />
            <Route
              path="/asignaciones"
              element={
                <RequireOrg>
                  <ComponentBoundary name="AsignacionesPage">
                    <AsignacionesPage />
                  </ComponentBoundary>
                </RequireOrg>
              }
            />
            <Route
              path="/costos"
              element={
                <RequireOrg>
                  <ComponentBoundary name="CostosPage">
                    <CostosPage />
                  </ComponentBoundary>
                </RequireOrg>
              }
            />
            <Route
              path="/costos-dashboard"
              element={
                <RequireOrg>
                  <ComponentBoundary name="CostosDashboardPage">
                    <CostosDashboardPage />
                  </ComponentBoundary>
                </RequireOrg>
              }
            />
            <Route
              path="/tracker-dashboard"
              element={
                <RequireOrg>
                  <ComponentBoundary name="TrackerDashboard">
                    <TrackerDashboard />
                  </ComponentBoundary>
                </RequireOrg>
              }
            />
            <Route
              path="/invitar-tracker"
              element={
                <RequireOrg>
                  <ComponentBoundary name="InvitarTracker">
                    <InvitarTracker />
                  </ComponentBoundary>
                </RequireOrg>
              }
            />

            <Route
              path="/admins"
              element={
                <RequireOrg>
                  <RootOwnerRoute>
                    <ComponentBoundary name="AdminsPage">
                      <AdminsPage />
                    </ComponentBoundary>
                  </RootOwnerRoute>
                </RequireOrg>
              }
            />

            <Route
              path="/help/instructions"
              element={
                <ComponentBoundary name="InstructionsPage">
                  <InstructionsPage />
                </ComponentBoundary>
              }
            />
            <Route
              path="/help/faq"
              element={
                <ComponentBoundary name="FaqPage">
                  <FaqPage />
                </ComponentBoundary>
              }
            />
            <Route
              path="/help/support"
              element={
                <ComponentBoundary name="SupportPage">
                  <SupportPage />
                </ComponentBoundary>
              }
            />
            <Route
              path="/help/changelog"
              element={
                <ComponentBoundary name="ChangelogPage">
                  <ChangelogPage />
                </ComponentBoundary>
              }
            />
          </Route>

          <Route path="*" element={<SmartFallback />} />
        </Routes>
      </GlobalErrorBoundary>
    </BrowserRouter>
  );
}
