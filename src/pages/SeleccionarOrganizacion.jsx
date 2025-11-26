// src/pages/SeleccionarOrganizacion.jsx
import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export default function SeleccionarOrganizacion() {
  const {
    user,
    organizations = [], // array de orgs desde my_memberships
    currentOrg,
    setCurrentOrg,
    loading,
  } = useAuth();

  const navigate = useNavigate();

  // Redirecciones básicas
  useEffect(() => {
    if (loading) return;

    if (!user) {
      navigate("/login", { replace: true });
      return;
    }

    // Si ya hay una organización seleccionada, vamos directo al dashboard
    if (currentOrg) {
      navigate("/inicio", { replace: true });
    }
  }, [loading, user, currentOrg, navigate]);

  if (loading || !user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <div className="h-10 w-10 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin" />
          <p className="text-slate-500 text-sm">
            Preparando tus organizaciones…
          </p>
        </div>
      </div>
    );
  }

  const hasOrgs = organizations && organizations.length > 0;

  function handleSelect(org) {
    // Compatibilidad: normalizamos a { id, name, ... }
    const normalized = {
      id: org.id || org.org_id,
      name: org.name || org.org_name,
      ...org,
    };

    setCurrentOrg(normalized);
    navigate("/inicio", { replace: true });
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-10">
      <div className="bg-white shadow-sm rounded-2xl p-6 border border-slate-100 space-y-4">
        <h1 className="text-2xl font-bold text-slate-800 mb-1">
          Seleccionar organización
        </h1>
        <p className="text-sm text-slate-600 mb-4">
          Has iniciado sesión correctamente. Ahora elige la organización con la
          que deseas trabajar en este momento.
        </p>

        {!hasOrgs && (
          <div className="border border-amber-300 bg-amber-50 text-amber-800 text-sm rounded-lg px-3 py-2">
            No encontramos organizaciones asociadas a tu usuario. Contacta al
            administrador para que te asigne una.
          </div>
        )}

        {hasOrgs && (
          <div className="space-y-3">
            {organizations.map((org) => {
              const name = org.name || org.org_name || "Organización sin nombre";
              const id = org.id || org.org_id;
              return (
                <button
                  key={id}
                  onClick={() => handleSelect(org)}
                  className="w-full text-left p-3 rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50 transition flex flex-col"
                >
                  <span className="font-semibold text-slate-800">{name}</span>
                  {org.org_code && (
                    <span className="text-xs text-slate-500">
                      Código: {org.org_code}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
