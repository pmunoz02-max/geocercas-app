import React from "react";
import UpgradeToProButton from "../components/Billing/UpgradeToProButton";

export default function BillingPage() {
  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ margin: 0, fontSize: 22 }}>Billing</h1>
      <p style={{ opacity: 0.75, marginTop: 8 }}>
        Monetización en <b>PREVIEW</b> (Paddle). No afecta producción.
      </p>

      <div style={{ marginTop: 16 }}>
        <UpgradeToProButton />
      </div>

      <div style={{ marginTop: 18, fontSize: 13, opacity: 0.8, maxWidth: 720 }}>
        <b>Nota:</b> Este módulo funciona sin tocar tu AuthContext. Toma el token desde <code>localStorage</code> (sb-*-auth-token)
        y por eso es “universal”. Más adelante, lo conectamos a tu OrgContext para que el <code>org_id</code> sea automático.
      </div>
    </div>
  );
}