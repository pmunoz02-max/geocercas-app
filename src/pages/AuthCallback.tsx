// src/pages/AuthCallback.jsx
import React, { useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

function isSafeInternalPath(p) {
  if (!p) return false;
  if (typeof p !== "string") return false;
  if (!p.startsWith("/")) return false;
  if (p.includes("://")) return false;
  if (p.startsWith("//")) return false;
  if (/[\u0000-\u001F\u007F]/.test(p)) return false;
  return true;
}

function isUuid(v) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    String(v || "")
  );
}

export default function AuthCallback() {
  const navigate = useNavigate();
  const location = useLocation();

  const { loading, session, role, isRootOwner, reloadAuth } = useAuth();

  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);

  const nextParam = useMemo(() => {
    const next = params.get("next");
    return next || null;
  }, [params]);

  // ✅ viene desde invite-user: /auth/callback?tracker_org_id=<uuid>
  const trackerOrgId = useMemo(() => {
    const v = params.get("tracker_org_id");
    return isUuid(v) ? v : null;
  }, [params]);

  useEffect(() => {
    if (loading) return;

    if (!session) {
      navigate("/login", { replace: true });
      return;
    }

    // ✅ SOLO flujo invite tracker:
    // guardamos un "force" para que AuthContext escoja esta org, aunque exista owner en otra org
    if (trackerOrgId) {
      localStorage.setItem("force_tracker_org_id", trackerOrgId);

      // Forzamos recarga de auth para que se re-evalúe org activa con el flag
      // (no rompe nada: reloadAuth ya existe y se usa para refrescar estados)
      try {
        if (typeof reloadAuth === "function") reloadAuth();
      } catch (e) {
        console.error("[AuthCallback] reloadAuth failed:", e);
      }
    }

    const roleLower = String(role || "").toLowerCase();

    // Si ya quedó tracker, directo al tracker-gps
    if (roleLower === "tracker") {
      navigate("/tracker-gps", { replace: true });
      return;
    }

    // NO trackers
    let dest = "/inicio";

    if (nextParam && isSafeInternalPath(nextParam)) {
      if (nextParam.startsWith("/tracker-gps")) dest = "/inicio";
      else if (nextParam.startsWith("/admins") && !isRootOwner) dest = "/inicio";
      else dest = nextParam;
    }

    navigate(dest, { replace: true });
  }, [loading, session, role, isRootOwner, nextParam, navigate, trackerOrgId, reloadAuth]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="px-4 py-3 rounded-xl bg-white border border-slate-200 shadow-sm text-sm text-slate-600">
        Finalizando autenticación…
      </div>
    </div>
  );
}
