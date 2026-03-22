import React, { useMemo, useState } from "react";

type Props = {
  orgId?: string | null;
  plan?: "PRO";
  projectRef?: string;
  onStarted?: () => void;
  getAccessToken?: () => Promise<string | null>;
};

function findSupabaseAccessToken(): string | null {
  const keys = Object.keys(localStorage);
  const key =
    keys.find((k) => k.startsWith("sb-") && k.endsWith("-auth-token")) ||
    keys.find((k) => k.includes("auth-token"));

  if (!key) return null;

  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);

    return (
      parsed?.access_token ||
      parsed?.currentSession?.access_token ||
      parsed?.session?.access_token ||
      null
    );
  } catch {
    return null;
  }
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v.trim()
  );
}

export default function UpgradeToProButton({
  orgId,
  plan = "PRO",
  projectRef = "wpaixkvokdkudymgjoua",
  onStarted,
  getAccessToken,
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

  const endpoint = `https://${projectRef}.supabase.co/functions/v1/paddle-create-checkout`;

  console.log("UpgradeToProButton render", { orgId, resolvedOrgId });

  const disabled = !resolvedOrgId || !isUuid(resolvedOrgId) || loading;

  async function resolveToken() {
    if (typeof getAccessToken === "function") {
      try {
        const tokenFromProp = await getAccessToken();
        if (tokenFromProp) return tokenFromProp;
      } catch (err) {
        console.warn("getAccessToken failed, fallback to localStorage", err);
      }
    }

    return findSupabaseAccessToken();
  }

  async function startCheckout() {
    setMsg(null);
    console.log("UpgradeToProButton click", { resolvedOrgId, endpoint });

    if (!resolvedOrgId || !isUuid(resolvedOrgId)) {
      setMsg("Org ID inválido. Copia el Organization ID (UUID) y pégalo aquí.");
      return;
    }

    const token = await resolveToken();

    if (!token) {
      setMsg("No hay sesión activa. Cierra sesión e inicia sesión nuevamente.");
      return;
    }

    localStorage.setItem("gc_active_org_id", resolvedOrgId);

    try {
      setLoading(true);
      onStarted?.();

      console.log("UpgradeToProButton request", {
        endpoint,
        org_id: resolvedOrgId,
        hasToken: !!token,
      });

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ org_id: resolvedOrgId, plan }),
      });

      const out = await res.json().catch(async () => ({ raw: await res.text() }));

      console.log("UpgradeToProButton response", {
        status: res.status,
        ok: res.ok,
        out,
      });

      if (!res.ok) {
        const m = out?.message || out?.error || out?.raw || JSON.stringify(out);

        if (res.status === 401) {
          setMsg(
            "Sesión inválida para Paddle checkout (401). Haz logout/login y vuelve a intentar."
          );
          return;
        }

        setMsg(`Error ${res.status}: ${m}`);
        return;
      }

      const checkoutUrl = out?.checkout?.url || out?.url;

      if (checkoutUrl) {
        window.location.href = checkoutUrl;
        return;
      }

      setMsg("Respuesta inesperada del servidor: no vino checkout.url.");
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

        <div className="text-xs text-slate-600 break-all">
          Endpoint: <code>{endpoint}</code>
        </div>

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