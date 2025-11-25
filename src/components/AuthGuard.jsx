// src/components/AuthGuard.jsx
import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { getSessionSafe, onAuthChange } from "../supabaseClient";

/**
 * Protege una ruta. Si no hay sesión:
 *  - redirige a /login
 *  - pasa en state.from la ruta actual para volver luego del login
 */
export default function AuthGuard({ children }) {
  const location = useLocation();
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const session = await getSessionSafe();
      if (!mounted) return;
      setHasSession(Boolean(session));
      setChecking(false);
    })();

    const off = onAuthChange((_evt, session) => {
      if (!mounted) return;
      setHasSession(Boolean(session));
      setChecking(false);
    });

    return () => {
      mounted = false;
      try {
        off?.();
      } catch {}
    };
  }, []);

  if (checking) {
    return (
      <div className="min-h-[40vh] grid place-items-center text-slate-600">
        Verificando sesión…
      </div>
    );
  }

  if (!hasSession) {
    const from =
      (location.pathname ?? "/") +
      (location.search ?? "") +
      (location.hash ?? "");
    return <Navigate to="/login" replace state={{ from }} />;
  }

  return children;
}
