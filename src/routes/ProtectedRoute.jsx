import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/context/AuthProvider";

export default function ProtectedRoute({ allowedRoles = [] }) {
  const { session, profile, loading } = useAuth();

  if (loading) return null;
  if (!session) return <Navigate to="/login" replace />;

  if (allowedRoles.length && !allowedRoles.includes(profile?.role || "")) {
    return <Navigate to="/not-authorized" replace />;
  }

  return <Outlet />;
}
