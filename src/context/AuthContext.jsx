// src/context/AuthContext.jsx

import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

const AuthContext = createContext(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  // Organización actual del usuario
  const [currentOrg, setCurrentOrg] = useState(null);

  // Rol del usuario en la organización actual
  const [currentRole, setCurrentRole] = useState(null);

  // ----------------------------------------------------
  // 1) Cargar sesión y usuario
  // ----------------------------------------------------
  useEffect(() => {
    let isMounted = true;

    async function loadSession() {
      const { data, error } = await supabase.auth.getSession();
      if (!isMounted) return;

      if (error) {
        console.error('[AuthContext] error getSession:', error);
      }

      setSession(data?.session ?? null);
      setUser(data?.session?.user ?? null);
      setLoading(false);
    }

    loadSession();

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!isMounted) return;
        setSession(session);
        setUser(session?.user ?? null);

        if (!session) {
          // Al cerrar sesión, limpiamos todo
          setCurrentOrg(null);
          setCurrentRole(null);
        }
      }
    );

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  // ----------------------------------------------------
  // 2) Asegurar organización y cargar currentOrg
  // ----------------------------------------------------
  useEffect(() => {
    if (!user) {
      setCurrentOrg(null);
      return;
    }

    let cancelled = false;

    async function loadOrgForUser() {
      // 2.0 Asegurar que exista una organización y rol admin para este usuario
      const { error: initErr } = await supabase.rpc('init_admin_tenant');
      if (initErr) {
        console.error('[AuthContext] error init_admin_tenant:', initErr);
        // seguimos igual, puede que ya exista todo
      }

      // 2.1 Obtener org_id desde profiles
      const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('org_id')
        .eq('id', user.id)
        .maybeSingle();

      if (cancelled) return;

      if (profileErr) {
        console.error('[AuthContext] error cargando perfil:', profileErr);
        setCurrentOrg(null);
        return;
      }

      if (!profile?.org_id) {
        console.warn('[AuthContext] usuario sin org_id en profiles');
        setCurrentOrg(null);
        return;
      }

      // 2.2 Cargar organización real desde orgs
      const { data: org, error: orgErr } = await supabase
        .from('orgs')
        .select('*')
        .eq('id', profile.org_id)
        .single();

      if (cancelled) return;

      if (orgErr) {
        console.error('[AuthContext] error cargando orgs:', orgErr);
        setCurrentOrg(null);
        return;
      }

      setCurrentOrg(org);
      console.log('[AuthContext] currentOrg cargada:', org);
    }

    loadOrgForUser();

    return () => {
      cancelled = true;
    };
  }, [user]);

  // ----------------------------------------------------
  // 3) Cargar rol actual vía RPC get_current_role(org_id)
  // ----------------------------------------------------
  useEffect(() => {
    if (!user || !currentOrg?.id) {
      setCurrentRole(null);
      return;
    }

    let cancelled = false;

    async function loadRoleForUser() {
      const { data, error } = await supabase.rpc('get_current_role', {
        p_org_id: currentOrg.id,
      });

      if (cancelled) return;

      if (error) {
        console.error('[AuthContext] error get_current_role:', error);
        setCurrentRole(null);
        return;
      }

      const role = data || 'tracker'; // si no hay fila → tracker por defecto
      setCurrentRole(role);
      console.log('[AuthContext] currentRole cargado:', role);
    }

    loadRoleForUser();

    return () => {
      cancelled = true;
    };
  }, [user, currentOrg?.id]);

  // Helpers derivados del rol
  const isOwner = currentRole === 'owner';
  const isAdmin = currentRole === 'admin' || currentRole === 'owner';
  const isTracker = !currentRole || currentRole === 'tracker';

  const value = {
    user,
    session,
    loading,

    currentOrg,
    setCurrentOrg,

    currentRole,
    isOwner,
    isAdmin,
    isTracker,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export default AuthContext;
