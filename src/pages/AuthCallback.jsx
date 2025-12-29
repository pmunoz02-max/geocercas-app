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

  const forcedOnce = useRef(false);
  const inviteStartTs = useRef(0);

  useEffect(() => {
    if (loading) return;

    if (!session) {
      navigate("/login", { replace: true });
      return;
    }

    const roleLower = String(role || "").toLowerCase();

    // ======================================================
    // ✅ CASO 1: INVITE TRACKER
    // Regla: JAMÁS navegar a panel desde aquí.
    // - Fuerza org one-shot
    // - Espera a que role sea tracker
    // - Si no se resuelve, reintenta reloadAuth (fail-closed)
    // ======================================================
    if (trackerOrgId) {
      // Primera pasada: fuerza org y recarga auth
      if (!forcedOnce.current) {
        forcedOnce.current = true;
        inviteStartTs.current = Date.now();

        localStorage.setItem("force_tracker_org_id", trackerOrgId);
        localStorage.setItem("current_org_id", trackerOrgId);

        if (typeof reloadAuth === "function") reloadAuth();
        return; // <- NO navegar todavía
      }

      // Ya forzamos: si ya es tracker, listo.
      if (roleLower === "tracker") {
        navigate("/tracker-gps", { replace: true });
        return;
      }

      // Fail-closed: si aún no es tracker, NO ir al panel.
      // Reintenta reloadAuth por un tiempo corto (por si hubo race).
      const elapsed = Date.now() - (inviteStartTs.current || 0);

      if (elapsed < 6000) {
        // Reintento suave (sin loops infinitos)
        if (typeof reloadAuth === "function") reloadAuth();
        return;
      }

      // Si en 6s no resolvió tracker, preferimos mandar a tracker-gps igual;
      // y el AuthGuard/TrackerGate hará cumplir reglas.
      navigate("/tracker-gps", { replace: true });
      return;
    }

    // ======================================================
    // ✅ CASO 2: CALLBACK NORMAL
    // ======================================================
    if (roleLower === "tracker") {
      navigate("/tracker-gps", { replace: true });
      return;
    }

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
