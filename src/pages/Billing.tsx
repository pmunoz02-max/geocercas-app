import React, { useEffect, useState } from "react";
import UpgradeToProButton from "@/components/Billing/UpgradeToProButton";

export default function BillingPage() {
  const [billing, setBilling] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulación: fetch billing info desde API o contexto
    // Reemplazar por lógica real si existe
    async function fetchBilling() {
      // Aquí deberías obtener billing real, por ahora simulado
      setBilling(window.__MOCK_BILLING__ || null);
      setLoading(false);
    }
    fetchBilling();
  }, []);

  // Condición: mostrar UpgradeToProButton si NO es PRO activo
  const showUpgrade = !billing || String(billing?.billing_plan_code).toLowerCase() !== "pro" || String(billing?.plan_status).toLowerCase() !== "active";

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ margin: 0, fontSize: 22 }}>Billing</h1>
      <p style={{ opacity: 0.75, marginTop: 8 }}>
        Monetización en <b>PREVIEW</b> (Paddle). No afecta producción.
      </p>

      {/* Bloque de límites/uso aquí si aplica */}

      {/* Renderizar UpgradeToProButton si NO es PRO activo */}
      {showUpgrade && (
        <div style={{ marginTop: 16 }}>
          <UpgradeToProButton />
        </div>
      )}

      {/* Bloque de management separado, copy neutral */}
      <div style={{ marginTop: 32, fontSize: 13, opacity: 0.8, maxWidth: 720 }}>
        <b>Portal de suscripción:</b> Portal de suscripción temporalmente deshabilitado mientras migramos a Paddle.
      </div>

      <div style={{ marginTop: 18, fontSize: 13, opacity: 0.8, maxWidth: 720 }}>
        <b>Nota:</b> Este módulo funciona sin tocar tu AuthContext. Toma el token desde <code>localStorage</code> (sb-*-auth-token)
        y por eso es “universal”. Más adelante, lo conectamos a tu OrgContext para que el <code>org_id</code> sea automático.
      </div>
    </div>
  );
}