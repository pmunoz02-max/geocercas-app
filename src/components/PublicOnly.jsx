import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function PublicOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-center">Cargando…</div>;
  if (user) return <Navigate to="/" replace />;
  return children;
}
