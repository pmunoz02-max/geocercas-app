import React, { useMemo, useState } from "react";

type Props = {
  /** org_id UUID (si lo tienes desde contexto). Si no, el componente muestra un input. */
  orgId?: string | null;
  /** Plan a comprar (por ahora solo PRO) */
  plan?: "PRO";
  /** Supabase project ref. Si no se pasa, usa el de PREVIEW por defecto */
  projectRef?: string;
  /** Callback opcional para logging */
  onStarted?: () => void;
};

function findSupabaseAccessToken(): string | null {
  // Busca el token en localStorage (formato típico: sb-<ref>-auth-token)
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
  projectRef = "mujwsfhkocsuuahlrssn", // PREVIEW por defecto
  onStarted,
}: Props) {
  const [orgInput, setOrgInput] = useState<string>(() => localStorage.getItem("gc_active_org_id") || "");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const resolvedOrgId = useMemo(() => (orgId && orgId.trim() ? orgId.trim() : orgInput.trim()), [orgId, orgInput]);

  const functionsBase = `https://${projectRef}.functions.supabase.co`;
  const endpoint = `${functionsBase}/stripe-create-checkout`;

  const disabled = !resolvedOrgId || !isUuid(resolvedOrgId) || loading;

  async function startCheckout() {
    setMsg(null);

    const token = findSupabaseAccessToken();
    if (!token) {
      setMsg("No hay sesión activa. Cierra sesión e inicia sesión nuevamente.");
      return;
    }

    if (!resolvedOrgId || !isUuid(resolvedOrgId)) {
      setMsg("Org ID inválido. Copia el Organization ID (UUID) y pégalo aquí.");
      return;
    }

    // Guardamos org activa para no volver a pedirla
    localStorage.setItem("gc_active_org_id", resolvedOrgId);

    try {
      setLoading(true);
      onStarted?.();

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ plan, org_id: resolvedOrgId }),
      });

      const out = await res.json().catch(async () => ({ raw: await res.text() }));

      if (!res.ok) {
        const m = out?.message || out?.error || JSON.stringify(out);
        setMsg(`Error ${res.status}: ${m}`);
        return;
      }

      if (out?.url) {
        window.location.href = out.url;
        return;
      }

      setMsg("Respuesta inesperada del servidor (no vino url). Revisa logs de la función.");
    } catch (e: any) {
      setMsg(`Error: ${String(e?.message ?? e)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, maxWidth: 520 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Geocercas PRO</div>
          <div style={{ fontSize: 13, opacity: 0.8 }}>USD $29/mes · 14 días trial · Stripe TEST (Preview)</div>
        </div>

        {!orgId && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600 }}>Organization ID (org_id)</label>
            <input
              value={orgInput}
              onChange={(e) => setOrgInput(e.target.value)}
              placeholder="Ej: ea4f7ebc-651a-48b9-9ac3-b0bdbee1db9a"
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #d1d5db",
                fontSize: 14,
                outline: "none",
              }}
            />
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              Tip: en tu Home ya aparece “Organization ID: …”. Cópialo una vez y queda guardado.
            </div>
          </div>
        )}

        <button
          onClick={startCheckout}
          disabled={disabled}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "none",
            cursor: disabled ? "not-allowed" : "pointer",
            fontWeight: 700,
            background: disabled ? "#9ca3af" : "#111827",
            color: "white",
          }}
        >
          {loading ? "Abriendo Stripe..." : "Suscribirme a PRO"}
        </button>

        <div style={{ fontSize: 12, opacity: 0.8 }}>
          Endpoint: <code>{endpoint}</code>
        </div>

        {msg && (
          <div style={{ background: "#fff7ed", border: "1px solid #fdba74", padding: 10, borderRadius: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>Aviso</div>
            <div style={{ fontSize: 13 }}>{msg}</div>
          </div>
        )}
      </div>
    </div>
  );
}