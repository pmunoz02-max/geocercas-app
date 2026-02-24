import React from "react";
import { useAuthSafe } from "@/context/auth.js";

export default function AuthGuard({ children, fallback = null }) {
  const auth = useAuthSafe?.() || null;
  if (!auth) return fallback;

  const { loading, session, authReady } = auth;

  if (loading || authReady === false) return fallback;
  if (!session) return fallback;

  return <>{children}</>;
}
