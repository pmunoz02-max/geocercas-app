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
 * - Evita que un error de render (React #300) tumbe toda la app
 * - Deja un mensaje claro y loggea stack en consola
 * ========================= */
class GlobalErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: "", stack: "", snapshot: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: toSafeString(error?.message || error) };
  }

  componentDidCatch(error, info) {
    const componentStack = info?.componentStack || "";
    // Logs para diagnóstico (no rompe producción)
    console.error("[GlobalErrorBoundary] Caught error:", error);
    console.error("[GlobalErrorBoundary] Component stack:", componentStack);
    if (this.props?.debugSnapshot) {
      console.error("[GlobalErrorBoundary] Debug snapshot:", this.props.debugSnapshot);
    }
    this.setState({ stack: componentStack, snapshot: this.props?.debugSnapshot || null });
  }

  handleReload = () => window.location.reload();

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="w-full max-w-3xl bg-white border border-red-200 rounded-2xl shadow-sm p-5">
          <h1 className="text-lg font-semibold text-red-700">Ocurrió un error en la interfaz</h1>
          <p className="text-sm text-slate-700 mt-2">
            Recarga la página. Si el problema persiste, copia el mensaje y envíalo a soporte.
          </p>

          <div className="mt-4 text-xs bg-slate-50 border rounded-xl p-3 space-y-2">
            <div>
              <b>Mensaje:</b> <span className="font-mono break-all">{this.state.message}</span>
            </div>
            {/* El stack es útil para ti, pero no es necesario mostrarlo siempre. */}
            {this.state.stack ? (
              <details className="mt-2">
                <summary className="cursor-pointer text-slate-600">Detalles técnicos</summary>
                <pre className="mt-1 font-mono whitespace-pre-wrap break-words text-slate-600">
                  {this.state.stack}
                </pre>
                {this.state.snapshot ? (
                  <pre className="mt-2 font-mono whitespace-pre-wrap break-words text-slate-600">
                    {toSafeString(this.state.snapshot)}
                  </pre>
                ) : null}
              </details>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={this.handleReload}
              className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm"
            >
              Recargar
            </button>
            <a href="/" className="px-4 py-2 rounded-xl border border-slate-300 text-sm">
              Ir al inicio
            </a>
          </div>

          <p className="text-[11px] text-slate-500 mt-4">
            Nota: Este panel aparece solo cuando ocurre un error de render. En condiciones normales no se muestra.
          </p>
        </div>
      </div>
    );
  }
}

/** =========================
 * UI helpers
 * ========================= */
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
      <Login />
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


function pickOrgPreview(orgs) {
  const arr = Array.isArray(orgs) ? orgs : [];
  return arr.slice(0, 8).map((o) => ({
    id: o?.id || null,
    name: o?.name,
    name_type: typeof o?.name,
  }));
}

/**
 * Envía un "snapshot" de estado útil al ErrorBoundary sin depender de sourcemaps.
 * Esto rompe el bucle: nos dice qué dato es objeto (y en qué ruta).
 */
function GlobalErrorBoundaryWithSnapshot({ children }) {
  const auth = useAuth?.() || {};
  const snapshot = {
    href: typeof window !== "undefined" ? window.location.href : "",
    user_email: auth?.user?.email || null,
    isAdmin: auth?.isAdmin ?? null,
    isRootOwner: auth?.isRootOwner ?? null,
    currentOrg: {
      id: auth?.currentOrg?.id || null,
      name: auth?.currentOrg?.name,
      name_type: typeof auth?.currentOrg?.name,
    },
    organizations_preview: pickOrgPreview(auth?.organizations),
  };

  return <GlobalErrorBoundary debugSnapshot={snapshot}>{children}</GlobalErrorBoundaryWithSnapshot>;
}

export default function App() {
  return (
    <BrowserRouter>
      <GlobalErrorBoundaryWithSnapshot>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<LoginShell />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          {/* Flujos auth */}
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/auth/invite" element={<InviteCallback />} />

          {/* Tracker-only */}
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

          {/* Panel */}
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

            <Route path="/nueva-geocerca" element={<RequireOrg><NuevaGeocerca /></RequireOrg>} />
            <Route path="/geocercas" element={<RequireOrg><GeocercasPage /></RequireOrg>} />
            <Route path="/personal" element={<RequireOrg><PersonalPage /></RequireOrg>} />
            <Route path="/actividades" element={<RequireOrg><ActividadesPage /></RequireOrg>} />
            <Route path="/asignaciones" element={<RequireOrg><AsignacionesPage /></RequireOrg>} />
            <Route path="/costos" element={<RequireOrg><CostosPage /></RequireOrg>} />
            <Route path="/costos-dashboard" element={<RequireOrg><CostosDashboardPage /></RequireOrg>} />
            <Route path="/tracker-dashboard" element={<RequireOrg><TrackerDashboard /></RequireOrg>} />
            <Route path="/invitar-tracker" element={<RequireOrg><InvitarTracker /></RequireOrg>} />

            <Route
              path="/admins"
              element={
                <RequireOrg>
                  <RootOwnerRoute>
                    <AdminsPage />
                  </RootOwnerRoute>
                </RequireOrg>
              }
            />

            <Route path="/help/instructions" element={<InstructionsPage />} />
            <Route path="/help/faq" element={<FaqPage />} />
            <Route path="/help/support" element={<SupportPage />} />
            <Route path="/help/changelog" element={<ChangelogPage />} />
          </Route>

          <Route path="*" element={<SmartFallback />} />
        </Routes>
      </GlobalErrorBoundaryWithSnapshot>
    </BrowserRouter>
  );
}
