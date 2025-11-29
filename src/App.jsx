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
import AsignacionesPage from "./components/asignaciones/AsignacionesPage.jsx";
import GeocercasPage from "./components/geocercas/GeocercasPage.jsx";
import ActivitiesPage from "./components/activities/ActivitiesPage.jsx";
import TrackerDashboard from "./components/tracker/TrackerDashboard.jsx";
import Inicio from "./pages/Inicio.jsx";
import CostosPage from "./pages/CostosPage.jsx";

// --- Layout ---
function Shell({ children }) {
  const location = useLocation();

  const linkStyle = ({ isActive }) =>
    `block px-4 py-2 rounded-md text-sm font-medium ${
      isActive
        ? "bg-indigo-600 text-white"
        : "text-gray-700 hover:bg-gray-200 hover:text-gray-900"
    }`;

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader />

      <div className="flex flex-1">
        {/* Sidebar */}
        <aside className="w-56 bg-gray-100 p-4 border-r">
          <nav className="space-y-2">

            {/* INICIO */}
            <NavLink to="/inicio" className={linkStyle}>
              Inicio
            </NavLink>

            {/* PERSONAL */}
            <NavLink to="/personal" className={linkStyle}>
              Personal
            </NavLink>

            {/* ACTIVIDADES */}
            <NavLink to="/actividades" className={linkStyle}>
              Actividades
            </NavLink>

            {/* ASIGNACIONES */}
            <NavLink to="/asignaciones" className={linkStyle}>
              Asignaciones
            </NavLink>

            {/* GEOCERCAS */}
            <NavLink to="/geocercas" className={linkStyle}>
              Geocercas
            </NavLink>

            {/* TRACKER DASHBOARD */}
            <NavLink to="/tracker" className={linkStyle}>
              Tracker
            </NavLink>

            {/* 🔥 AHORA SE LLAMA REPORTES */}
            <NavLink to="/costos" className={linkStyle}>
              Reportes
            </NavLink>
          </nav>
        </aside>

        {/* Main */}
        <main className="flex-1 p-4 bg-white overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* RUTAS PÚBLICAS */}
        <Route
          path="/"
          element={
            <PublicOnly>
              <Navigate to="/inicio" replace />
            </PublicOnly>
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
                <ActivitiesPage />
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

        {/* GEOCERCAS */}
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

        {/* TRACKER */}
        <Route
          path="/tracker"
          element={
            <AuthGuard>
              <Shell>
                <TrackerDashboard />
              </Shell>
            </AuthGuard>
          }
        />

        {/* 🔥 COSTOS → REPORTES (solo cambia el nombre visual) */}
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

        {/* 404 */}
        <Route path="*" element={<Navigate to="/inicio" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
