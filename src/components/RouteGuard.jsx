import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";

export default function RouteGuard({ allow, children }) {
  const { role, loading } = useAuth();
  if (loading) return null;
  if (!role) return <Navigate to="/inicio" replace />;
  if (allow && !allow.includes(role)) return <Navigate to="/inicio" replace />;
  return children;
}
