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