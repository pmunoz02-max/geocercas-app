// src/pages/SeleccionarOrganizacion.jsx
// Pantalla para elegir organización después del login.
// Lee directamente de Supabase: user_organizations + organizations,
// y usa AuthContext solo para setCurrentOrg.

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { useAuth } from "../context/AuthContext.jsx";

function SeleccionarOrganizacion() {
  const navigate = useNavigate();
  const { user, loading: authLoading, currentOrg, setCurrentOrg } = useAuth();

  const [orgs, setOrgs] = useState([]);
  const [loadingOrgs, setLoadingOrgs] = useState(true);
  const [error, setError] = useState(null);

  // ------------------------------------------------------------
  // Cargar organizaciones directamente desde Supabase
  // ------------------------------------------------------------
  useEffect(() => {
    if (!user) {
      setLoadingOrgs(false);
      return;
    }

    let cancelled = false;

    async function loadOrganizations() {
      setLoadingOrgs(true);
      setError(null);

      try {
        // Paso A: memberships en user_organizations
        const { data: memberships, error: memErr } = await supabase
          .from("user_organizations")
          .select("org_id, role")
          .eq("user_id", user.id);

        if (memErr) {
          console.error("[SeleccionarOrganizacion] memberships error:", memErr);
          if (!cancelled) setError("No se pudieron cargar las organizaciones.");
          return;
        }

        const memList = memberships || [];
        if (memList.length === 0) {
          if (!cancelled) {
            setOrgs([]);
          }
          return;
        }

        const orgIds = memList.map((m) => m.org_id).filter(Boolean);

        // Paso B: info de organizations
        const { data: orgData, error: orgErr } = await supabase
          .from("organizations")
          .select("id, name, slug")
          .in("id", orgIds);

        if (orgErr) {
          console.error("[SeleccionarOrganizacion] organizations error:", orgErr);
          if (!cancelled) setError("No se pudieron cargar las organizaciones.");
          return;
        }

        const mapById = new Map((orgData || []).map((o) => [o.id, o]));

        const normalized = memList.map((m) => {
          const org = mapById.get(m.org_id) || {};
          return {
            id: m.org_id,
            name: org.name || "(sin nombre)",
            code: org.slug || null,
            role: m.role || null,
          };
        });

        if (!cancelled) {
          setOrgs(normalized);

          // Si ya hay currentOrg válido, no hacemos nada.
          // Si no hay currentOrg y solo hay una org, la seleccionamos automáticamente.
          if (!currentOrg && normalized.length === 1) {
            const onlyOrg = normalized[0];
            setCurrentOrg(onlyOrg);
            navigate("/inicio");
          }
        }
      } catch (e) {
        console.error("[SeleccionarOrganizacion] exception:", e);
        if (!cancelled)
          setError("Ocurrió un error inesperado al cargar organizaciones.");
      } finally {
        if (!cancelled) setLoadingOrgs(false);
      }
    }

    loadOrganizations();
    return () => {
      cancelled = true;
    };
  }, [user, currentOrg, setCurrentOrg, navigate]);

  // ------------------------------------------------------------
  // Manejar selección manual
  // ------------------------------------------------------------
  const handleSelectOrg = (org) => {
    if (!org) return;
    setCurrentOrg(org);
    navigate("/inicio");
  };

  // ------------------------------------------------------------
  // Estados de carga / error
  // ------------------------------------------------------------
  if (authLoading || loadingOrgs) {
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

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold mb-2">Seleccionar organización</h1>
      <p className="text-gray-600 text-sm mb-4">
        Has iniciado sesión correctamente. Ahora elige la organización con la
        que deseas trabajar en este momento.
      </p>

      {!hasOrgs && !error && (
        <div className="border border-yellow-300 bg-yellow-50 text-yellow-800 rounded px-4 py-3 text-sm">
          No encontramos organizaciones asociadas a tu usuario. Contacta al
          administrador para que te asigne una.
        </div>
      )}

      {error && (
        <div className="border border-red-300 bg-red-50 text-red-800 rounded px-4 py-3 text-sm mb-4">
          {error}
        </div>
      )}

      {hasOrgs && (
        <div className="space-y-3 mt-3">
          {orgs.map((org) => (
            <button
              key={org.id}
              type="button"
              onClick={() => handleSelectOrg(org)}
              className="w-full text-left border rounded px-4 py-3 hover:bg-slate-50 transition flex items-center justify-between"
            >
              <div>
                <div className="font-medium">{org.name}</div>
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
      )}
    </div>
  );
}

export default SeleccionarOrganizacion;
