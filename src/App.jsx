// src/App.jsx
import React, { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate, Link } from "react-router-dom";
import Login from "./pages/Login"; // importa ESTÁTICO (evita problemas de carga de chunks)

const APP_TITLE = "APP DE CONTROL DE PERSONAL CON GEOCERCAS";

function getSession() {
  const token = sessionStorage.getItem("token");
  const userRaw = sessionStorage.getItem("user");
  const user = userRaw ? JSON.parse(userRaw) : null;
  return { token, user };
}

function roleToPath(role) {
  switch (role) {
    case "owner": return "/owner";
    case "admin": return "/admin";
    default: return "/tracker";
  }
}

function ProtectedRoute({ children, allowedRoles }) {
  const { token, user } = getSession();
  const location = useLocation();
  if (!token) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (allowedRoles?.length) {
    const role = user?.role;
    if (!role || !allowedRoles.includes(role)) return <Navigate to={roleToPath(role)} replace />;
  }
  return children;
}

function AppLayout({ children }) {
  const { token, user } = getSession();
  const navigate = useNavigate();
  const handleLogout = () => {
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("user");
    navigate("/login", { replace: true });
  };
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-slate-200">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
          <Link to="/" className="text-sm font-semibold tracking-tight">{APP_TITLE}</Link>
          {token ? (
            <div className="flex items-center gap-3 text-sm">
              <span className="hidden sm:inline text-slate-600">
                {user?.email} — <strong>{(user?.role || "").toUpperCase()}</strong>
              </span>
              <button onClick={handleLogout} className="rounded-xl border border-slate-300 px-3 py-1.5 hover:bg-slate-100">Salir</button>
            </div>
          ) : (
            <Link to="/login" className="rounded-xl border border-slate-300 px-3 py-1.5 hover:bg-slate-100 text-sm">Ingresar</Link>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      <footer className="mx-auto max-w-6xl px-4 py-8 text-xs text-slate-500">© {new Date().getFullYear()} — {APP_TITLE}</footer>
    </div>
  );
}

function RootRedirect() {
  const { token, user } = getSession();
  if (!token) return <Navigate to="/login" replace />;
  return <Navigate to={roleToPath(user?.role)} replace />;
}

function OwnerPage() {
  return (<section className="space-y-4"><h2 className="text-2xl font-bold">Panel Owner</h2><p className="text-slate-600">Control total: compañías, billing, seguridad, auditoría.</p></section>);
}
function AdminPage() {
  return (<section className="space-y-4"><h2 className="text-2xl font-bold">Panel Administrador</h2><p className="text-slate-600">Gestión de equipos, usuarios, geocercas y reportes.</p></section>);
}
function TrackerPage() {
  return (<section className="space-y-4"><h2 className="text-2xl font-bold">Panel Tracker</h2><p className="text-slate-600">Marcación, ubicación en tiempo real y tareas del día.</p></section>);
}

/* ---- ErrorBoundary para evitar pantalla blanca ---- */
class ErrorBoundary extends React.Component {
  constructor(props){ super(props); this.state = { hasError:false, err:null }; }
  static getDerivedStateFromError(error){ return { hasError:true, err:error }; }
  componentDidCatch(error, info){ console.error("ErrorBoundary:", error, info); }
  render(){
    if (this.state.hasError){
      return (
        <div className="min-h-screen grid place-items-center p-6">
          <div className="max-w-xl w-full rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800">
            <h2 className="text-lg font-semibold mb-2">Se produjo un error en la UI</h2>
            <p className="text-sm mb-3">Revisa consola para más detalles. Si persiste, comparte el mensaje de error.</p>
            <pre className="text-xs overflow-auto">{String(this.state.err)}</pre>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  useEffect(() => { document.title = APP_TITLE; }, []);
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <Routes>
          <Route path="/" element={<AppLayout><RootRedirect /></AppLayout>} />
          <Route
            path="/login"
            element={
              <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center p-4">
                <div className="w-full max-w-2xl"><Login /></div>
              </div>
            }
          />
          <Route path="/owner" element={<ProtectedRoute allowedRoles={["owner"]}><AppLayout><OwnerPage /></AppLayout></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute allowedRoles={["admin","owner"]}><AppLayout><AdminPage /></AppLayout></ProtectedRoute>} />
          <Route path="/tracker" element={<ProtectedRoute allowedRoles={["tracker","admin","owner"]}><AppLayout><TrackerPage /></AppLayout></ProtectedRoute>} />
          <Route path="*" element={<AppLayout><div><h2 className="text-2xl font-bold">404 — Página no encontrada</h2></div></AppLayout>} />
        </Routes>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
