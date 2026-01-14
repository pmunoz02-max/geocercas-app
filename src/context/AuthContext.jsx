// src/context/AuthContext.jsx
// POSTLOGIN-V2 – NO network call to /auth/v1/user (WebView-safe)

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase, getMemoryAccessToken, clearMemoryAccessToken } from "../supabaseClient";

const AuthContext = createContext(null);

function decodeJwt(token) {
  try {
    const payload = token.split(".")[1];
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  // org / role (se cargan después)
  const [organizations, setOrganizations] = useState([]);
  const [currentOrg, setCurrentOrg] = useState(null);
  const [currentRole, setCurrentRole] = useState(null);
  const [isAppRoot, setIsAppRoot] = useState(false);
  const [loadingOrg, setLoadingOrg] = useState(false);

  function reset() {
    setUser(null);
    setOrganizations([]);
    setCurrentOrg(null);
    setCurrentRole(null);
    setIsAppRoot(false);
  }

  // 🔐 INIT: SOLO token local
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const token = getMemoryAccessToken?.();
        if (!token) {
          reset();
          return;
        }

        const payload = decodeJwt(token);
        if (!payload?.sub) {
          clearMemoryAccessToken?.();
          reset();
          return;
        }

        // ✅ Usuario local, SIN red
        const localUser = {
          id: payload.sub,
          email: payload.email || null,
        };

        if (cancelled) return;
        setUser(localUser);

        // ⚠️ NO cargamos org aquí todavía
        // RequireOrg se encarga luego
      } finally {
        if (!cancelled) setLoadingAuth(false);
      }
    }

    init();
    return () => { cancelled = true; };
  }, []);

  const value = useMemo(
    () => ({
      loading: loadingAuth || loadingOrg,
      user,
      organizations,
      currentOrg,
      currentRole,
      isAppRoot,
      setCurrentOrg,
      setCurrentRole,
      supabase,
    }),
    [loadingAuth, loadingOrg, user, organizations, currentOrg, currentRole, isAppRoot]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}
