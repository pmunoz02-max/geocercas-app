import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { useAuth } from "@/context/auth.js";
import Tracker from "./Tracker.jsx";

export default function TrackerPage() {
  const { user, currentOrg, setCurrentOrg } = useAuth();

  const [resolviendoOrg, setResolviendoOrg] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelado = false;

    async function ensureOrg() {
      if (!user) {
        setResolviendoOrg(false);
        return;
      }

      if (currentOrg && currentOrg.id) {
        setResolviendoOrg(false);
        return;
      }

      try {
        let orgId = null;
        let role = null;

        // 1) CANÓNICO: memberships
        const { data: membership, error: membershipErr } = await supabase
          .from("memberships")
          .select("org_id, role, is_default, revoked_at")
          .eq("user_id", user.id)
          .is("revoked_at", null)
          .order("is_default", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (membershipErr) {
          console.warn("[TrackerPage] memberships error:", membershipErr);
        }

        if (membership?.org_id) {
          orgId = membership.org_id;
          role = membership.role || "tracker";
        }

        // 2) Fallback legacy solo si memberships no resolvió nada
        if (!orgId) {
          const { data: legacyRows, error: legacyErr } = await supabase
            .from("user_organizations")
            .select("org_id, role")
            .eq("user_id", user.id)
            .limit(1);

          if (legacyErr) {
            console.warn("[TrackerPage] user_organizations fallback error:", legacyErr);
          }

          const legacy = Array.isArray(legacyRows) ? legacyRows[0] : null;
          if (legacy?.org_id) {
            orgId = legacy.org_id;
            role = legacy.role || "tracker";
          }
        }

        if (!orgId) {
          if (!cancelado) {
            setError(
              "Tu usuario no tiene ninguna organización activa asignada. Contacta al administrador."
            );
          }
          return;
        }

        // 3) Leer datos de organización
        const { data: orgData, error: orgErr } = await supabase
          .from("organizations")
          .select("id, name, slug")
          .eq("id", orgId)
          .maybeSingle();

        if (orgErr) {
          console.warn("[TrackerPage] organizations error:", orgErr);
        }

        const orgObj = {
          id: orgData?.id || orgId,
          name: orgData?.name || "(sin nombre)",
          code: orgData?.slug || null,
          role: role || "tracker",
        };

        if (!cancelado) {
          setCurrentOrg(orgObj);
        }

        // 4) Persistir org activa (best-effort)
        try {
          await supabase.rpc("set_current_org", { p_org_id: orgId });
        } catch (e) {
          console.warn("[TrackerPage] set_current_org warning:", e);
        }
      } catch (e) {
        if (!cancelado) {
          console.error("[TrackerPage] error resolviendo organización:", e);
          setError(
            "No se pudo determinar tu organización. Contacta al administrador."
          );
        }
      } finally {
        if (!cancelado) {
          setResolviendoOrg(false);
        }
      }
    }

    ensureOrg();

    return () => {
      cancelado = true;
    };
  }, [user, currentOrg, setCurrentOrg]);

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
          Usted está enviando su posición a la organización{" "}
          <span className="font-semibold">{orgName}</span>{" "}
          a la que usted pertenece.
        </div>
      )}

      <div className="border rounded-xl p-3 bg-white">
        <Tracker />
      </div>
    </div>
  );
}
