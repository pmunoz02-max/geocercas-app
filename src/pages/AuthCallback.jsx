// src/pages/AuthCallback.tsx (contenido JS válido)
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { useAuth } from "../context/AuthContext.jsx";

function isUuid(v) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    String(v || "")
  );
}

export default function AuthCallback() {
  const navigate = useNavigate();
  const location = useLocation();
  const { loading, session, role, reloadAuth } = useAuth();

  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const code = useMemo(() => params.get("code"), [params]);

  const trackerOrgId = useMemo(() => {
    const v = params.get("tracker_org_id");
    return isUuid(v) ? v : null;
  }, [params]);

  const ranOnce = useRef(false);
  const forcedOnce = useRef(false);
  const [working, setWorking] = useState(true);

  // 1) Callback robusto: SIEMPRE reemplaza la sesión local antes del exchange
  useEffect(() => {
    let alive = true;

    async function run() {
      try {
        if (!code) {
          // si no hay code, no es callback válido
          navigate("/login", { replace: true });
          return;
        }
        if (ranOnce.current) return;
        ranOnce.current = true;

        setWorking(true);

        // ✅ Mata cualquier sesión previa en este navegador (solo local)
        // evita que el owner "contamine" el callback del tracker
        try {
          await supabase.auth.signOut({ scope: "local" });
        } catch (_) {}

        // ✅ Fuerza exchange del code -> nueva sesión
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          console.error("[AuthCallback] exchangeCodeForSession:", error);
          navigate("/login", { replace: true });
          return;
        }

        // ✅ Si viene de invite tracker, fuerza org one-shot
        if (trackerOrgId) {
          localStorage.setItem("force_tracker_org_id", trackerOrgId);
          localStorage.setItem("current_org_id", trackerOrgId);
        }

        // ✅ Rehidrata AuthContext ya con la sesión correcta
        if (typeof reloadAuth === "function") await reloadAuth();

        // Navegación final: si es tracker, irá a /tracker-gps (por tus guards igual)
        navigate("/tracker-gps", { replace: true });
      } finally {
        if (alive) setWorking(false);
      }
    }

    run();
    return () => {
      alive = false;
    };
  }, [code, trackerOrgId, navigate, reloadAuth]);

  // 2) Defensa: si ya está resuelto y no es tracker, no lo dejes en callback
  useEffect(() => {
    if (loading) return;
    if (!session) return;

    const r = String(role || "").toLowerCase();
    if (r && r !== "tracker") {
      navigate("/inicio", { replace: true });
    }
  }, [loading, session, role, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="px-4 py-3 rounded-xl bg-white border border-slate-200 shadow-sm text-sm text-slate-600">
        Finalizando autenticación…
        {working ? "" : ""}
      </div>
    </div>
  );
}
