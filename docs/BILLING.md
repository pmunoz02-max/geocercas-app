# Billing — estado actual y transición Dodo

## Hito Dodo Payments aprobado (2026-06-25)

Dodo Payments aprobó la cuenta de **FENICE ECUADOR S.A.S.**:

- Account Verification Forms approved.
- Live payments active.
- Payouts enabled.
- UBO ID, tax document/RUC e incorporation document aceptados.
- Productos TEST creados:
  - Geocercas GPS PRO — USD 29/month — `pdt_0NhoMPN43aL0XnHSZhrTk`
  - Geocercas GPS Enterprise — USD 99/month — `pdt_0NhoND6E41RsKWVP43fW1`

Documento fuente: [dodo-payments-approval.md](./dodo-payments-approval.md).

## Regla de transición

Aunque Dodo ya está aprobado, **no activar checkout live en producción todavía**.

La integración debe hacerse primero en `preview`, con TEST checkout / TEST webhooks y sin exponer secretos.

La fuente de verdad del plan debe seguir siendo la base de datos interna. Dodo debe actuar como proveedor externo de cobro, checkout, suscripciones, eventos y payouts.

---

## Fuente de verdad

La fuente de verdad del billing actual es:

- Edge Function: paddle-create-checkout
- Frontend: UpgradeToProButton.tsx

NO usar Stripe como referencia para nuevos cambios.
## Entornos Paddle

- Preview → Paddle Sandbox
- Producción → Paddle Live

⚠️ Importante:
El entorno live puede devolver errores como:

transaction_checkout_not_enabled

si la cuenta no ha sido completamente habilitada por Paddle.

## Problemas conocidos en producción

### Error: `transaction_checkout_not_enabled` en Paddle Live

En entorno de producción (Paddle Live), es posible recibir el error:

```
transaction_checkout_not_enabled
```

Esto ocurre cuando la cuenta de Paddle Live aún no ha sido completamente habilitada por el equipo de Paddle. Mientras tanto, el entorno de preview (Paddle Sandbox) funciona normalmente y permite pruebas de checkout.

**Solución:**
- Contactar a soporte de Paddle para completar la habilitación de la cuenta Live.
- Hasta entonces, los checkouts en producción fallarán con este error, pero el entorno de preview seguirá funcionando.

---
## Normalización de org_id

Para evitar errores entre frontend y backend:

La Edge Function acepta:

- org_id
- orgId

y los convierte internamente a:

org_id (formato estándar)

Esto evita errores como:

- Missing org_id
- missing_orgId_or_plan

y permite compatibilidad entre versiones del frontend.
## Flujo de checkout (Paddle)

1. Usuario hace click en "Suscribirme a PRO"
2. Frontend (UpgradeToProButton.tsx):
  - obtiene org_id activo
  - normaliza org_id
  - envía request a Edge Function paddle-create-checkout
3. Edge Function:
  - acepta org_id o orgId
  - normaliza a org_id
  - valida plan
  - crea checkout en Paddle
4. Paddle Checkout
5. Webhook (pendiente implementación completa):
  - activa plan en org_billing

# Sistema de Billing

App Geocercas funciona como SaaS multi-tenant.

## Entornos

- **Producción:** Paddle (modo live)
- **Preview:** Paddle (modo sandbox)
- **Stripe:** Deprecado/legacy (solo para migraciones históricas)

## Tecnología

- Paddle (checkout, suscripciones y webhooks en preview y producción)
- Stripe (legacy, solo para cuentas antiguas)

## Planes

Ejemplo:
- Free
- Pro
- Enterprise

## Flujo Actual Paddle (Preview y Producción)

```
usuario crea organización
  ↓
trial activo
  ↓
checkout paddle-create-checkout (Edge Function)
  ↓
Paddle Checkout (sandbox o live según entorno)
  ↓
webhook paddle-webhook
  ↓
se actualiza org_billing
```

### Normalización de org_id/orgId

- El frontend envía ambos campos: `org_id` y `orgId` (temporalmente, para compatibilidad).
- La función `paddle-create-checkout` normaliza ambos y usa internamente un solo valor `orgId`.
- Si falta el id, la función responde con error y muestra ambos valores crudos y el valor normalizado.
- El payload a Paddle siempre lleva `custom_data.org_id`.

---

Ver detalles y arquitectura en [PADDLE_PREVIEW_MIGRATION.md](./PADDLE_PREVIEW_MIGRATION.md)

## Estado operativo Preview — checkout externo TEST validado (2026-06-26)

La capa web de Preview ya no depende del flujo legacy de Paddle para los botones públicos de suscripción de esta fase.

Estado vigente en `preview`:

- proveedor lógico: `external_checkout`;
- proveedor externo actual: Dodo Payments Test Mode;
- página pública: `/pricing` y `/precios`;
- PRO: USD 29/month — `pdt_0NhoMPN43aL0XnHSZhrTk`;
- Enterprise: USD 99/month — `pdt_0NhoND6E41RsKWVP43fW1`;
- fuente de verdad del plan: base de datos interna;
- sincronización automática: todavía no implementada.

La documentación Paddle permanece como referencia histórica y de transición. No usarla como instrucción para crear nuevos checkouts Dodo.

Restricciones:

- no checkout LIVE;
- no webhooks;
- no API keys en frontend;
- no modificación de tablas sin auditoría SQL previa;
- no cambios Android;
- no Promote sin orden expresa.

Ver `DODO_CHECKOUT_PREVIEW_INTEGRATION.md`.
