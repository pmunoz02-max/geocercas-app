import React, { useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Props = {
  orgId?: string | null;
  plan?: "PRO";
  projectRef?: string;
  onStarted?: () => void;
  getAccessToken?: () => Promise<string | null>;
};

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v.trim()
  );
}

export default function UpgradeToProButton({
  orgId,
  plan = "PRO",
  onStarted,
}: Props) {
  const [orgInput, setOrgInput] = useState<string>(
    () => localStorage.getItem("gc_active_org_id") || ""
  );
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const resolvedOrgId = useMemo(
    () => (orgId && orgId.trim() ? orgId.trim() : orgInput.trim()),
    [orgId, orgInput]
  );

  console.log("UpgradeToProButton render", { orgId, resolvedOrgId });

  const disabled = !resolvedOrgId || !isUuid(resolvedOrgId) || loading;

  async function startCheckout() {
    setMsg(null);
    console.log("UpgradeToProButton click", { resolvedOrgId });

    if (!resolvedOrgId || !isUuid(resolvedOrgId)) {
      setMsg("Org ID inválido. Copia el Organization ID (UUID) y pégalo aquí.");
      return;
    }



    localStorage.setItem("gc_active_org_id", resolvedOrgId);

    try {
      setLoading(true);
      onStarted?.();

      console.log("UpgradeToProButton request", {
        org_id: resolvedOrgId,
        plan,
      });


      // Log temporal de sesión primaria
      const { data: sessionData } = await supabase.auth.getSession();
      console.log("PRIMARY SESSION CHECK", {
        hasSession: !!sessionData?.session,
        userId: sessionData?.session?.user?.id || null,
        tokenPrefix: sessionData?.session?.access_token?.slice(0, 16) || null,
      });


      const {
        data: { session },
      } = await supabase.auth.getSession();

      const accessToken = session?.access_token;
      if (!accessToken) {
        throw new Error("No session token");
      }

      try {
        console.log("[PADDLE BUTTON] click");
        console.log("[PADDLE BUTTON] orgId", currentOrg?.id);

        const result = await supabase.functions.invoke("paddle-create-checkout", {
          body: {
            org_id: resolvedOrgId,
            plan: "PRO",
          },
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        console.log("[PADDLE BUTTON] raw result", result);
        console.log("[PADDLE BUTTON] data", result?.data);
        console.log("[PADDLE BUTTON] error", result?.error);

        if (result?.error) {
          // No redirect if error
          return;
        }

        if (result?.data?.checkout_url) {
          window.location.href = result.data.checkout_url;
          return;
        }

        console.warn("[PADDLE BUTTON] checkout_url missing", result?.data);
        // No fallback redirect
      } catch (e) {
        console.error("[PADDLE CHECKOUT EXCEPTION]", e);
      }
    } catch (e: any) {
      console.error("UpgradeToProButton error", e);
      setMsg(`Error: ${String(e?.message ?? e)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4">
        <div>
          <div className="text-lg font-bold text-slate-900">Geocercas PRO</div>
          <div className="text-sm text-slate-700">
            USD $29/mes · Paddle (Preview)
          </div>
        </div>

        <div className="text-sm text-slate-800">
          <b>Org ID:</b>{" "}
          <span className="font-mono break-all text-slate-900">
            {resolvedOrgId || "(no resuelta)"}
          </span>
        </div>

        {!orgId && (
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-slate-900">
              Organization ID (org_id)
            </label>
            <input
              value={orgInput}
              onChange={(e) => setOrgInput(e.target.value)}
              placeholder="Ej: ea4f7ebc-651a-48b9-9ac3-b0bdbee1db9a"
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none"
            />
            <div className="text-xs text-slate-600">
              Si no se detecta automáticamente, pega aquí el UUID de la organización.
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={startCheckout}
          disabled={disabled}
          className="rounded-xl bg-slate-900 px-5 py-3 text-base font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Abriendo Paddle..." : "Suscribirme a PRO"}
        </button>

        {msg && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <div className="font-semibold">Aviso</div>
            <div className="mt-1 whitespace-pre-wrap break-words">{msg}</div>
          </div>
        )}
      </div>
    </div>
  );
}