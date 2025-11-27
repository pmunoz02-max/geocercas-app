// src/pages/TrackerPage.jsx
// Página mínima para el TRACKER:
// - Se usa como destino del Magic Link (/tracker).
// - Detecta la organización automáticamente.
// - Muestra un mensaje sencillo y monta el componente <Tracker /> para
//   empezar a enviar posiciones.
//
// IMPORTANTE: Ajusta la ruta de import de useAuth y de Tracker si en tu
// proyecto real están en otra carpeta.

import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { useAuth } from "../context/AuthContext.jsx";
import Tracker from "./Tracker.jsx"; // si Tracker.jsx está en otra carpeta, corrige el path

export default function TrackerPage() {
  const { user, currentOrg, setCurrentOrg } = useAuth();

  const [resolviendoOrg, setResolviendoOrg] = useState(true);
  const [error, setError] = useState(null);

  // ------------------------------------------------------------
  // 1. Resolver automáticamente la organización del tracker
  // ------------------------------------------------------------
  useEffect(() => {
    let cancelado = false;

    async function ensureOrg() {
      if (!user) {
        setResolviendoOrg(false);
        return;
      }

      // Ya hay organización activa → no hacemos nada más
      if (currentOrg && currentOrg.id) {
        setResolviendoOrg(false);
        return;
      }

      try {
        // A) memberships en user_organizations
        const { data: memberships, error: memErr } = await supabase
          .from("user_organizations")
          .select("org_id, role")
          .eq("user_id", user.id);

        if (memErr) {
          console.error("[TrackerPage] memberships error:", memErr);
          throw memErr;
        }

        const lista = memberships || [];
        if (lista.length === 0) {
          setError(
            "Tu usuario no tiene ninguna organización asignada. Contacta al administrador."
          );
          setResolviendoOrg(false);
          return;
        }

        // Para el tracker asumimos que solo pertenece a una org; tomamos la primera
        const m = lista[0];

        // B) Traer info de esa organización
        const { data: orgData, error: orgErr } = await supabase
          .from("organizations")
          .select("id, name, slug")
          .eq("id", m.org_id)
          .maybeSingle();

        if (orgErr) {
          console.error("[TrackerPage] organizations error:", orgErr);
          throw orgErr;
        }

        const orgObj = {
          id: orgData?.id || m.org_id,
          name: orgData?.name || "(sin nombre)",
          code: orgData?.slug || null,
          role: m.role || "TRACKER",
        };

        if (!cancelado) {
          setCurrentOrg(orgObj);
        }
      } catch (e) {
        if (!cancelado) {
          console.error("[TrackerPage] error resolviendo organización:", e);
          setError(
            "No se pudo determinar tu organización. Contacta al administrador."
          );
        }
      } finally {
        if (!cancelado) setResolviendoOrg(false);
      }
    }

    ensureOrg();
    return () => {
      cancelado = true;
    };
  }, [user, currentOrg, setCurrentOrg]);

  // ------------------------------------------------------------
  // 2. Render según estado
  // ------------------------------------------------------------
  if (!user) {
    return (
      <div className="p-6 max-w-xl mx-auto">
        <h1 className="text-2xl font-semibold mb-2">Acceso al tracker</h1>
        <p className="text-gray-600 text-sm">
          No se encontró una sesión activa. Abre el enlace de Magic Link que
          recibiste en tu correo para comenzar a enviar tu ubicación.
        </p>
      </div>
    );
  }

  if (resolviendoOrg) {
    return (
      <div className="p-6 max-w-xl mx-auto">
        <h1 className="text-2xl font-semibold mb-2">Preparando tracker…</h1>
        <p className="text-gray-600 text-sm">
          Estamos verificando tu organización y preparando el envío de tu
          ubicación. Por favor, espera un momento.
        </p>
      </div>
    );
  }

  const orgName = currentOrg?.name || "tu organización";

  return (
    <div className="p-6 max-w-xl mx-auto">
      <h1 className="text-2xl font-semibold mb-3">Tracker activo</h1>

      {error ? (
        <div className="border border-red-300 bg-red-50 text-red-800 rounded px-4 py-2 text-sm mb-4">
          {error}
        </div>
      ) : (
        <div className="border border-emerald-300 bg-emerald-50 text-emerald-800 rounded px-4 py-3 text-sm mb-4">
          {/* Mensaje principal que quieres */}
          Usted está enviando su posición a la organización{" "}
          <span className="font-semibold">{orgName}</span>{" "}
          a la que usted pertenece.
        </div>
      )}

      <div className="border rounded-xl p-3 bg-white">
        {/* Aquí se monta el componente que realmente hace el envío de posiciones */}
        <Tracker />
      </div>
    </div>
  );
}
