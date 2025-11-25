// /src/components/RequireRole.jsx
import { Navigate } from "react-router-dom";
import { useProfile } from "@/hooks/useProfile";

export default function RequireRole({ allow = ["admin"], children }) {
  const { profile, loading } = useProfile();

  if (loading) return <div className="p-6">Cargando…</div>;
  if (!profile) return <Navigate to="/login" replace />;

  const role = profile.roleSlug; // 'admin' | 'owner' | 'tracker' | null
  const allowed = Array.isArray(allow) ? allow : [allow];

  if (!role || !allowed.includes(role)) return <Navigate to="/" replace />;

  return children;
}
