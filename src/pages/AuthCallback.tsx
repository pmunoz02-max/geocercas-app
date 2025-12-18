// src/pages/AuthCallback.jsx
import React, { useEffect, useMemo, useRef } from "react";
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
  const nextParam = useMemo(() => params.get("next") || null, [params]);

  // ✅ viene desde invite-user: /auth/callback?tracker_org_id=<uuid>
  const trackerOrgId = useMemo(() => {
    const v = params.get("tracker_org_id");
    return isUuid(v) ? v : null;
  }, [params]);

  // evita loops de reloadAuth
  const forcedOnce = useRef(false);

  useEffect(() => {
    if (loading) return;

    if (!session) {
      navigate("/login", { replace: true });
      return;
    }

    // ✅ SOLO invite tracker: forzar org activa ONE-SHOT
    if (trackerOrgId && !forcedOnce.current) {
      forcedOnce.current = true;

      localStorage.setItem("force_tracker_org_id", trackerOrgId);
      localStorage.setItem("current_org_id", trackerOrgId);

      if (typeof reloadAuth === "function") reloadAuth();

      // esperamos a que AuthContext recalcule role/org antes de navegar
      return;
    }

    const roleLower = String(role || "").toLowerCase();

    // tracker => tracker-only
    if (roleLower === "tracker") {
      navigate("/tracker-gps", { replace: true });
      return;
    }

    // NO trackers: respetar next si es seguro
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
