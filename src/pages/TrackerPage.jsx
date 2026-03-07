import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import { useAuth } from "@/context/auth.js";
import Tracker from "./Tracker.jsx";
import useOrgEntitlements from "@/hooks/useOrgEntitlements.js";
import UpgradeToProButton from "@/components/Billing/UpgradeToProButton.jsx";

function normalizePlanLabel(planCode) {
  const v = String(planCode || "").toLowerCase();
  if (v === "pro") return "PRO";
  if (v === "enterprise") return "ENTERPRISE";
  if (v === "elite_plus") return "ELITE PLUS";
  if (v === "elite") return "ELITE";
  if (v === "starter") return "STARTER";
  if (v === "free") return "FREE";
  return v ? v.toUpperCase() : "—";
}

export default function TrackerPage() {
  const { user, currentOrg, setCurrentOrg } = useAuth();
  const {
    loading: entitlementsLoading,
    error: entitlementsError,
    planCode,
    isFree,
  } = useOrgEntitlements();

  const [resolviendoOrg, setResolviendoOrg] = useState(true);
  const [error, setError] = useState(null);

  async function getAccessToken() {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || null;
  }

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

  const orgName = currentOrg?.name || "tu organización";
  const currentOrgId = currentOrg?.id || null;

  const trackerBlockedByPlan = useMemo(() => {
    return !entitlementsLoading && isFree;
  }, [entitlementsLoading, isFree]);

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

  if (entitlementsLoading) {
    return (
      <div className="p-6 max-w-xl mx-auto">
        <h1 className="text-2xl font-semibold mb-2">Validando plan…</h1>
        <p className="text-gray-600 text-sm">
          Estamos verificando si tu organización tiene habilitado el módulo Tracker.
        </p>
      </div>
    );
  }

  if (entitlementsError) {
    return (
      <div className="p-6 max-w-xl mx-auto">
        <h1 className="text-2xl font-semibold mb-3">Tracker</h1>
        <div className="border border-amber-300 bg-amber-50 text-amber-800 rounded px-4 py-3 text-sm">
          No se pudo validar el plan de la organización. Intenta nuevamente.
          <div className="mt-2 font-mono text-xs break-all">{entitlementsError}</div>
        </div>
      </div>
    );
  }

  if (trackerBlockedByPlan) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-4">
        <h1 className="text-2xl font-semibold">Tracker</h1>

        <div className="border border-amber-300 bg-amber-50 text-amber-900 rounded-xl px-4 py-4">
          <div className="text-base font-semibold">
            El módulo Tracker no está disponible en el plan actual.
          </div>
          <div className="mt-2 text-sm">
            Organización: <span className="font-semibold">{orgName}</span>
          </div>
          <div className="mt-1 text-sm">
            Plan detectado: <span className="font-semibold">{normalizePlanLabel(planCode)}</span>
          </div>
          <div className="mt-3 text-sm">
            Para enviar y gestionar posiciones en tiempo real, actualiza esta organización a PRO o superior.
          </div>
        </div>

        {currentOrgId ? (
          <div className="border rounded-xl p-4 bg-white">
            <div className="text-sm text-gray-700 mb-3">
              Haz upgrade para habilitar Tracker en esta organización.
            </div>
            <UpgradeToProButton
              orgId={currentOrgId}
              getAccessToken={getAccessToken}
            />
          </div>
        ) : null}

        <div className="border border-slate-200 bg-slate-50 text-slate-700 rounded-xl px-4 py-3 text-sm">
          El backend sigue siendo la autoridad. Este bloqueo es visual y de experiencia
          de usuario para reflejar el plan activo de la organización.
        </div>
      </div>
    );
  }

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