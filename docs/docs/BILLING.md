# Sistema de Billing

App Geocercas funciona como SaaS multi-tenant.

## Entornos

- **Producción:** Stripe legacy (no migrado a Paddle)
- **Preview:** Paddle (migrado, Stripe deshabilitado)

## Tecnología

- Stripe (producción)
- Paddle (preview)

## Planes

Ejemplo:
- Free
- Pro
- Enterprise

## Flujo Producción (Stripe legacy)

```
usuario crea organización
  ↓
trial activo
  ↓
checkout stripe
  ↓
webhook confirma pago
  ↓
se actualiza org_billing
```

## Flujo Preview (Paddle)

```
usuario crea organización
  ↓
trial activo
  ↓
checkout paddle-create-checkout
  ↓
Paddle Checkout
  ↓
webhook paddle-webhook
  ↓
se actualiza org_billing
```

Ver detalles y arquitectura en [PADDLE_PREVIEW_MIGRATION.md](./PADDLE_PREVIEW_MIGRATION.md)