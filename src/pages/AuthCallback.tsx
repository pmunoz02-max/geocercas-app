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

  const {
    loading,
    session,
    role,
    isRootOwner,
    currentOrgId,
    selectOrg,
    reloadAuth,
    organizations,
  } = useAuth();

  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);

  const nextParam = useMemo(() => {
    const next = params.get("next");
    return next || null;
  }, [params]);

  // ✅ Este es el parámetro clave que tu invite-user ya manda en redirectTo
  const trackerOrgIdParam = useMemo(() => {
    const v = params.get("tracker_org_id");
    return isUuid(v) ? v : null;
  }, [params]);

  // Evitar loops: forzar org activa solo 1 vez por callback
  const forcedOrgOnceRef = useRef(false);

  useEffect(() => {
    // Esperar a que AuthContext termine de cargar
    if (loading) return;

    // Si no hay sesión, volver a login
    if (!session) {
      navigate("/login", { replace: true });
      return;
    }

    // =========================================================
    // ✅ FIX TRACKER INVITE:
    // Si llega tracker_org_id, forzamos org activa ANTES de decidir ruta.
    // Esto evita que el usuario caiga al panel por tener OWNER/ADMIN en otra org.
    // =========================================================
    if (trackerOrgIdParam && !forcedOrgOnceRef.current) {
      const alreadyActive = String(currentOrgId || "") === trackerOrgIdParam;

      if (!alreadyActive) {
        forcedOrgOnceRef.current = true;

        // 1) Persistir para que AuthContext lo use (si aplica)
        localStorage.setItem("current_org_id", trackerOrgIdParam);

        // 2) Si ya tenemos organizaciones cargadas, seleccionamos directo.
        //    Si no, pedimos reloadAuth y luego en el siguiente render se resolverá.
        const hasOrgLoaded =
          Array.isArray(organizations) && organizations.some((o) => o?.id === trackerOrgIdParam);

        try {
          if (hasOrgLoaded && typeof selectOrg === "function") {
            selectOrg(trackerOrgIdParam);
          } else if (typeof reloadAuth === "function") {
            reloadAuth();
          }
        } catch (e) {
          // Si algo falla, al menos dejamos el current_org_id listo.
          console.error("[AuthCallback] force tracker org failed:", e);
        }

        // Importante: salimos aquí para esperar a que role/currentOrg se actualicen
        return;
      } else {
        forcedOrgOnceRef.current = true;
      }
    }

    const roleLower = String(role || "").toLowerCase();

    // ✅ REGLA UNIVERSAL: tracker SIEMPRE aterriza en la pantalla de envío automático
    if (roleLower === "tracker") {
      navigate("/tracker-gps", { replace: true });
      return;
    }

    // Para NO-trackers: respetar next si es seguro y permitido
    let dest = "/inicio";

    if (nextParam && isSafeInternalPath(nextParam)) {
      // Bloquear acceso directo a tracker-gps para no-trackers
      if (nextParam.startsWith("/tracker-gps")) {
        dest = "/inicio";
      }
      // Bloquear /admins si no es root owner
      else if (nextParam.startsWith("/admins") && !isRootOwner) {
        dest = "/inicio";
      } else {
        dest = nextParam;
      }
    }

    navigate(dest, { replace: true });
  }, [
    loading,
    session,
    role,
    isRootOwner,
    nextParam,
    navigate,
    trackerOrgIdParam,
    currentOrgId,
    selectOrg,
    reloadAuth,
    organizations,
  ]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="px-4 py-3 rounded-xl bg-white border border-slate-200 shadow-sm text-sm text-slate-600">
        Finalizando autenticación…
      </div>
    </div>
  );
}
