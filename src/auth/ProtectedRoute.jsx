import { Navigate } from "react-router-dom";

// TODO: reemplaza esta función por tu verificación real (Supabase Auth).
function useAuth() {
  // Ejemplo simple:
  const isAuthenticated = true; // <-- Conectar a tu estado real
  return { isAuthenticated };
}

export default function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/" replace />;
  return children;
}
