import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import NoOrgSelected from "./NoOrgSelected";

export default function RequireOrg({ children }) {
  const { user, loading, currentOrg } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-sm opacity-70">Loading…</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (!currentOrg) {
    return <NoOrgSelected />;
  }

  return children;
}
