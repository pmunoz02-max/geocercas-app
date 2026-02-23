import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import AuthGuard from "./components/AuthGuard";
import Login from "./pages/Login";
import AuthCallback from "./pages/AuthCallback";
import TrackerGpsPage from "./pages/TrackerGpsPage";
import TrackerAccept from "./pages/TrackerAccept";
import Inicio from "./pages/Inicio";
import NotFound from "./pages/NotFound";

function App() {
  return (
    <Router>
      <Routes>

        {/* ===== RUTAS PUBLICAS ===== */}
        <Route path="/login" element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/tracker-accept" element={<TrackerAccept />} />
        <Route path="/tracker-gps" element={<TrackerGpsPage />} />

        {/* ===== RUTAS PRIVADAS ===== */}
        <Route
          path="/inicio"
          element={
            <AuthGuard>
              <Inicio />
            </AuthGuard>
          }
        />

        {/* ===== 404 ===== */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Router>
  );
}

export default App;