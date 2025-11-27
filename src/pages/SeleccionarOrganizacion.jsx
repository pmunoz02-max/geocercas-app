// src/pages/SeleccionarOrganizacion.jsx
// Pantalla para elegir organización después del login.
//
// Lógica universal:
//  - Las organizaciones se obtienen SIEMPRE del AuthContext (orgs).
//  - Si ya existe currentOrg, se redirige automáticamente:
//      * TRACKER  → /tracker
//      * OWNER/ADMIN (u otros) → /inicio
//  - Si el usuario tiene una sola organización, se autoselecciona.
//  - Si tiene varias, elige manualmente tocando la tarjeta.
//
// Esto evita rebotes tipo: /inicio se ve un instante y luego va a
// /seleccionar-organizacion, porque la decisión depende de loading
// y del estado real de currentOrg en AuthContext.

import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

function SeleccionarOrganizacion() {
  const navigate = useNavigate();
  const {
    user,
    loading,       // loading global del AuthContext (sesión + datos)
    orgs,          // organizaciones normalizadas
    currentOrg,
    currentRole,
    setCurrentOrg,
  } = useAuth();

  // Normaliza rol para decidir destino
  const normalizeRole = (role) =>
    (role || "").toString().trim().toLowerCase();

  const goToHomeByRole = (role) => {
    const r = normalizeRole(role);
    if (r === "tracker") {
      navigate("/tracker", { replace: true });
    } else {
      navigate("/inicio", { replace: true });
    }
  };

  // ------------------------------------------------------------
  // 1) Si no hay usuario y ya no estamos cargando → a /login
  // ------------------------------------------------------------
  useEffect(() => {
    if (loading) return;
    if (!user) navigate("/login", { replace: true });
  }, [loading, user, navigate]);

  // ------------------------------------------------------------
  // 2) Si YA hay currentOrg, no tiene sentido estar aquí
  //    → redirigir directo según el rol
  // ------------------------------------------------------------
  useEffect(() => {
    if (loading) return;
    if (!user) return;
    if (!currentOrg) return;

    const roleFromOrg = normalizeRole(currentOrg.role);
    const role = roleFromOrg || normalizeRole(currentRole);
    goToHomeByRole(role);
  }, [loading, user, currentOrg, currentRole]); // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------------------
  // 3) Si no hay currentOrg pero sólo hay una organización,
  //    autoseleccionarla y redirigir automáticamente.
  // ------------------------------------------------------------
  useEffect(() => {
    if (loading) return;
    if (!user) return;
    if (currentOrg) return;
    if (!orgs || orgs.length !== 1) return;

    const onlyOrg = orgs[0];
    setCurrentOrg(onlyOrg);
    const role = normalizeRole(onlyOrg.role);
    goToHomeByRole(role);
  }, [loading, user, currentOrg, orgs, setCurrentOrg]); // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------------------
  // 4) Selección manual de organización (card click)
  // ------------------------------------------------------------
  const handleSelectOrg = (org) => {
    if (!org) return;
    setCurrentOrg(org);
    const role = normalizeRole(org.role);
    goToHomeByRole(role);
  };

  // ------------------------------------------------------------
  // 5) Render según estado
  // ------------------------------------------------------------
  if (loading) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <h1 className="text-2xl font-semibold mb-2">
          Seleccionar organización
        </h1>
        <p className="text-gray-600 text-sm">
          Cargando organizaciones asociadas a tu usuario…
        </p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <h1 className="text-2xl font-semibold mb-2">Sesión no válida</h1>
        <p className="text-gray-600 text-sm">
          No hay sesión activa. Inicia sesión nuevamente.
        </p>
      </div>
    );
  }

  const hasOrgs = orgs && orgs.length > 0;

  if (!hasOrgs) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <h1 className="text-2xl font-semibold mb-2">
          Seleccionar organización
        </h1>
        <p className="text-gray-600 text-sm mb-4">
          Has iniciado sesión correctamente, pero no encontramos
          organizaciones asociadas a tu usuario.
        </p>
        <div className="border border-yellow-300 bg-yellow-50 text-yellow-800 rounded px-4 py-3 text-sm">
          Contacta al administrador para que te asigne una organización
          o crea una nueva desde el panel de administración.
        </div>
      </div>
    );
  }

  // Si llegamos aquí:
  // - hay usuario
  // - hay organizaciones
  // - currentOrg es null (o la autoselección aún no ha corrido)
  // Mostramos la lista para que el usuario escoja.
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold mb-2">Seleccionar organización</h1>
      <p className="text-gray-600 text-sm mb-4">
        Has iniciado sesión correctamente. Ahora elige la organización con la
        que deseas trabajar en este momento.
      </p>

      <div className="space-y-3 mt-3">
        {orgs.map((org) => (
          <button
            key={org.id}
            type="button"
            onClick={() => handleSelectOrg(org)}
            className="w-full text-left border rounded px-4 py-3 hover:bg-slate-50 transition flex items-center justify-between"
          >
            <div>
              <div className="font-medium">{org.name || "(sin nombre)"}</div>
              <div className="text-xs text-gray-500">
                {org.code ? `Código: ${org.code}` : "Sin código definido"}
              </div>
            </div>
            {org.role && (
              <span className="text-xs uppercase font-semibold text-gray-500">
                {org.role}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

export default SeleccionarOrganizacion;
