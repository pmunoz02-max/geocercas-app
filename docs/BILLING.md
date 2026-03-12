# Sistema de Billing

App Geocercas funciona como SaaS.

## Tecnología

- Stripe

## Planes

Ejemplo:
- Free
- Pro
- Enterprise

## Flujo

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