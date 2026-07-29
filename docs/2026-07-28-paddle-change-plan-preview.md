# Paddle PRO → Enterprise en Preview

Fecha: 2026-07-28
Entorno autorizado: `preview`
Producción: sin cambios
Rama autorizada: `preview`
Proveedor activo previsto: Paddle
Proveedor de reserva: Dodo, sin cambios
## Objetivo

Agregar la Edge Function `paddle-change-plan` para ascender una organización con
una suscripción Paddle PRO activa a Enterprise sin crear una segunda
suscripción.

## Archivo nuevo

Copiar `index.ts` a:

```text
supabase/functions/paddle-change-plan/index.ts
```

No se modifica `supabase/functions/_shared/authz.ts`.

## Reglas implementadas

- Solo acepta `POST` y requiere `org_id`.
- Solo permite el destino `enterprise`.
- Usa `requireOrgAdmin()` para exigir rol `owner` o `admin` en la organización.
- Lee `org_billing` mediante el cliente administrativo.
- Solo opera cuando el proveedor es `paddle`.
- Exige una suscripción PRO con estado `active`, `trialing` o `past_due`.
- Bloquea una cancelación pendiente.
- Bloquea un cambio programado pendiente.
- Si Enterprise ya está activo, responde de forma idempotente sin llamar a
  Paddle.
- Si `paddle_price_id` ya corresponde a Enterprise pero la base todavía dice
  PRO, bloquea un segundo intento y espera la sincronización del webhook.
- Cambia la suscripción existente con:
  - `PATCH /subscriptions/{subscription_id}`
  - lista completa de artículos con el precio Enterprise y cantidad 1;
  - `proration_billing_mode: "prorated_immediately"`;
  - `on_payment_failure: "prevent_change"`.
- No actualiza directamente `org_billing`. `paddle-webhook` conserva la
  autoridad final sobre el plan y el estado.
- No devuelve ni registra la API key ni el cuerpo completo de Paddle.

## Variables reutilizadas

La función conserva las convenciones actuales:

```text
PADDLE_ENV
PADDLE_API_KEY
PADDLE_ENTERPRISE_PRICE_ID_SANDBOX
PADDLE_ENTERPRISE_PRICE_ID_LIVE
```

No se crean columnas ni migraciones.

## Flujo resultante

| Estado | Acción |
|---|---|
| Free/inactive | `paddle-create-checkout` |
| PRO activo en Paddle | `paddle-change-plan` |
| Enterprise activo en Paddle | No crea otra compra |
| Suscripción Dodo | Bloquea; Dodo permanece en reserva |
| Cancelación o cambio pendiente | Bloquea hasta resolver el estado |

## Orden de implementación en Preview

1. Guardar el nuevo archivo en la ruta indicada.
2. Revisar `git diff` y confirmar que la rama sea `preview`.
3. Verificar que los cuatro nombres de secretos existan en el proyecto Preview,
   sin mostrar sus valores.
4. Desplegar solamente `paddle-change-plan` al proyecto Preview.
5. Probar primero los bloqueos sin ejecutar un cambio real.
6. Actualizar `UpgradeToProButton.tsx` para dirigir Free/inactive a
   `paddle-create-checkout` y PRO activo a `paddle-change-plan`.
7. Actualizar la documentación canónica de Billing.
8. Hacer push únicamente a `preview` y probar el deployment Preview.

## Pruebas mínimas

- Sin JWT: `401`.
- Usuario sin rol owner/admin: `403`.
- `org_id` ausente: `400`.
- Free/inactive: `409 paddle_pro_subscription_required`.
- Proveedor Dodo: `409 subscription_managed_by_other_provider`.
- Cancelación pendiente: `409 subscription_cancel_pending`.
- Cambio pendiente: `409 subscription_has_pending_change`.
- Enterprise activo: `200 already_active`.
- PRO Paddle activo: respuesta exitosa con `pending_webhook: true`.
- Confirmar después del webhook:
  - `billing_provider = 'paddle'`;
  - `plan_code = 'enterprise'`;
  - `subscribed_plan_code = 'enterprise'`;
  - `paddle_price_id` igual al precio Enterprise del entorno.

## Límites de esta entrega

- No cambia el botón todavía.
- No despliega ninguna función.
- No toca Producción.
- No hace push a `main`.
- No modifica secretos, tablas ni datos.
- No elimina ni altera la integración Dodo.
