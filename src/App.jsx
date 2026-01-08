// src/App.jsx
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";

// Pages
import Login from "./pages/Login";
import AuthCallback from "./pages/AuthCallback";
import InviteCallback from "./pages/InviteCallback";
import Inicio from "./pages/Inicio";
import TrackerGps from "./pages/TrackerGps";

// (importa aquí el resto de tus páginas reales)
import Personal from "./pages/Personal";
import Geocercas from "./pages/Geocercas";
import Actividades from "./pages/Actividades";
import Asignaciones from "./pages/Asignaciones";
import Reportes from "./pages/Reportes";
import DashboardCostos from "./pages/DashboardCostos";

function ProtectedRoute({ children, trackerOnly = false }) {
  const { session, loading, role } = useAuth();

  if (loading) return null;
  if (!session) return <Navigate to="/login" replace />;

  if (trackerOnly && role !== "tracker") {
    return <Navigate to="/inicio" replace />;
  }

  return children;
}

export default function App() {
  return (
    <Router>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<Login />} />

        {/* AUTH CALLBACKS (SEPARADOS FORMALMENTE) */}
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/auth/invite" element={<InviteCallback />} />

        {/* PANEL */}
        <Route
          path="/inicio"
          element={
            <ProtectedRoute>
              <Inicio />
            </ProtectedRoute>
          }
        />

        <Route
          path="/geocercas"
          element={
            <ProtectedRoute>
              <Geocercas />
            </ProtectedRoute>
          }
        />

        <Route
          path="/personal"
          element={
            <ProtectedRoute>
              <Personal />
            </ProtectedRoute>
          }
        />

        <Route
          path="/actividades"
          element={
            <ProtectedRoute>
              <Actividades />
            </ProtectedRoute>
          }
        />

        <Route
          path="/asignaciones"
          element={
            <ProtectedRoute>
              <Asignaciones />
            </ProtectedRoute>
          }
        />

        <Route
          path="/reportes"
          element={
            <ProtectedRoute>
              <Reportes />
            </ProtectedRoute>
          }
        />

        <Route
          path="/dashboard-costos"
          element={
            <ProtectedRoute>
              <DashboardCostos />
            </ProtectedRoute>
          }
        />

        {/* TRACKER */}
        <Route
          path="/tracker-gps"
          element={
            <ProtectedRoute trackerOnly>
              <TrackerGps />
            </ProtectedRoute>
          }
        />

        {/* FALLBACK */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Router>
  );
}
