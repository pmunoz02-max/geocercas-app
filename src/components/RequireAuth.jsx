import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import supabase from '../supabase';

export default function RequireAuth() {
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const location = useLocation();

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data, error } = await supabase.auth.getSession();
      if (!mounted) return;
      if (error) console.error('[RequireAuth] getSession error:', error);
      setHasSession(!!data?.session);
      setChecking(false);
    })();
    return () => { mounted = false; };
  }, []);

  if (checking) return <div style={{ padding: 16 }}>Cargando…</div>;
  if (!hasSession) {
    // Guarda a dónde quería ir para mandarlo de regreso tras login
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <Outlet />; // continúa con /admin
}
