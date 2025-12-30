// src/pages/Inicio.jsx
import React, { useMemo } from "react";
import { useAuth } from "../context/AuthContext.jsx";

export default function Inicio() {
  const {
    authReady,
    user,
    currentOrg,
    currentRole, // si existe (fix en AuthContext)
    bestRole, // fallback
    roles,
    orgs,
    trackerDomain,
  } = useAuth();

  // 1) Evita estados intermedios que dejan la UI colgada
  if (!authReady) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-slate-500">
        Resolviendo permisos…
      </div>
    );
  }

  // 2) Si no hay usuario (debería estar protegido por AuthGuard, pero lo blindamos)
  if (!user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-slate-500">
        Inicia sesión para continuar.
      </div>
    );
  }

  // 3) Rol robusto: currentRole (si existe) -> bestRole -> vacío
  const roleLower = String(currentRole || bestRole || "").toLowerCase().trim();

  // 4) Si por alguna carrera todavía no hay rol, mostramos loader en vez de pantalla blanca
  if (!roleLower) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-slate-500">
        Resolviendo permisos…
      </div>
    );
  }

  // 5) Si no hay org todavía, también loader (y muestra hints)
  if (!currentOrg) {
    const orgCount = Array.isArray(orgs) ? orgs.length : 0;
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-slate-600 px-4 text-center gap-3">
        <div className="text-slate-500">Preparando organización…</div>
        <div className="text-sm text-slate-500">
          {orgCount === 0
            ? "Tu usuario aún no tiene una organización asignada."
            : "Seleccionando organización activa…"}
        </div>
      </div>
    );
  }

  // 6) Render del panel de inicio (simple y seguro)
  const email = user?.email || "";
  const orgName = currentOrg?.name || currentOrg?.org_name || currentOrg?.id || "";

  const roleLabel = useMemo(() => {
    if (roleLower === "owner") return "Owner";
    if (roleLower === "admin") return "Admin";
    if (roleLower === "viewer") return "Viewer";
    if (roleLower === "tracker") return "Tracker";
    return roleLower || "—";
  }, [roleLower]);

  const rolesCount = Array.isArray(roles) ? roles.length : 0;

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">Inicio</h2>
        <p className="text-slate-600 mt-1">
          Bienvenido{email ? `, ${email}` : ""}.
        </p>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs uppercase tracking-wide text-slate-500">
              Organización activa
            </div>
            <div className="text-slate-900 font-medium mt-1">{orgName}</div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs uppercase tracking-wide text-slate-500">
              Rol
            </div>
            <div className="text-slate-900 font-medium mt-1">{roleLabel}</div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs uppercase tracking-wide text-slate-500">
              Contexto
            </div>
            <div className="text-slate-900 font-medium mt-1">
              {trackerDomain ? "Tracker domain" : "Panel domain"}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Roles detectados: {rolesCount}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">Estado</h3>
        <div className="mt-2 text-sm text-slate-600 space-y-1">
          <div>
            <span className="text-slate-500">authReady:</span>{" "}
            {String(authReady)}
          </div>
          <div>
            <span className="text-slate-500">currentOrg.id:</span>{" "}
            {String(currentOrg?.id || "")}
          </div>
          <div>
            <span className="text-slate-500">role:</span>{" "}
            {String(currentRole || bestRole || "")}
          </div>
        </div>
      </div>
    </div>
  );
}
