# Migración de Billing Preview: Stripe Legacy → Paddle

## Resumen Ejecutivo

En el entorno preview de TuGeocercas, el sistema de billing SaaS fue migrado de Stripe legacy a Paddle, modernizando el flujo de upgrade, checkout y sincronización de suscripciones. Producción sigue usando Stripe legacy; no mezclar entornos.

---

## Cambios Implementados (Preview)
- Checkout ahora usa Paddle: `/functions/v1/paddle-create-checkout`
- Webhook ahora usa Paddle: `/functions/v1/paddle-webhook`
- verify_jwt = false en paddle-webhook
- UI de upgrade migrada a Paddle (labels, endpoints, lógica)
- Portal Stripe deshabilitado temporalmente en preview
- org_billing extendida con columnas Paddle
- Webhook responde 200 OK y preparado para validar firma
- Variables de entorno y secrets actualizados

### Archivos tocados
- src/components/Billing/UpgradeToProButton.tsx / .jsx
- src/components/Billing/ManageSubscriptionButton.jsx
- src/pages/Billing.tsx / .jsx
- supabase/functions/paddle-create-checkout/index.ts
- supabase/functions/paddle-webhook/index.ts
- supabase/config.toml

---

## Arquitectura Actual Billing Preview (Paddle)

```
UI upgrade
  ↓
paddle-create-checkout (Edge Function)
  ↓
Paddle Checkout (modal)
  ↓
Paddle Notifications (webhook)
  ↓
paddle-webhook (Edge Function)
  ↓
update org_billing
  ↓
UI billing
```

- **checkout.url** es devuelta por paddle-create-checkout y usada para redirect
- **webhook** recibe eventos Paddle y actualiza org_billing

---

## Configuración de Supabase Functions

- **paddle-create-checkout**: crea sesión Paddle Checkout
- **paddle-webhook**: recibe notificaciones Paddle
  - `verify_jwt = false` en config.toml
- Webhook URL: `https://wpaixkvokdkudymgjoua.supabase.co/functions/v1/paddle-webhook`
- Proyecto preview: `wpaixkvokdkudymgjoua`

---

## Variables de Entorno y Secrets

- `PADDLE_API_KEY`
- `PADDLE_PRO_PRICE_ID`
- `PADDLE_WEBHOOK_SECRET` (endpoint_secret_key)
- `SUPABASE_SERVICE_ROLE_KEY`

---

## org_billing: Estructura y Uso para Paddle

- `billing_provider = paddle`
- `paddle_customer_id`
- `paddle_subscription_id`
- `paddle_price_id`
- `plan_status`
- `current_period_end`
- `subscribed_plan_code`
- `plan_code`
- `last_paddle_event_at`

---

## Eventos Paddle relevantes
- `subscription.created`
- `subscription.updated`
- `subscription.canceled`
- `transaction.completed`

---

## Limitaciones y Riesgos Actuales
- Falta idempotencia robusta en webhook
- Portal de gestión Paddle no implementado
- Simulaciones Paddle pueden no traer custom_data.org_id
- Riesgo de mezcla con Stripe legacy si se reutilizan componentes viejos
- UI puede mostrar Stripe si no se actualizan todos los labels
- No migrar producción hasta validar preview

---

## Decisiones Importantes
- No mezclar preview con producción
- No hacer push a main
- Probar siempre en preview
- Toda alteración de arquitectura requiere update de docs

---

## Troubleshooting

- **401 Unauthorized:**
  - Verifica que `verify_jwt = false` en paddle-webhook
- **502 Bad Gateway:**
  - Handler inválido o error en Edge Function
- **Firma inválida:**
  - Secret incorrecto (`endpoint_secret_key` de Paddle)
- **Falta org_id en custom_data:**
  - Simulaciones Paddle pueden omitirlo; revisar payload
- **UI muestra Stripe legacy:**
  - Verifica labels y endpoints en componentes de upgrade
- **Endpoint incorrecto:**
  - Debe ser `supabase.co/functions/v1`, no `functions.supabase.co`

---

## Próximos Pasos
- Implementar portal de gestión Paddle
- Mejorar idempotencia y logging en webhook
- Validar migración completa antes de promover a producción
- Actualizar docs tras cada cambio relevante

---

## Estado Actual
- Preview: Paddle activo, Stripe legacy deshabilitado
- Producción: Stripe legacy, sin migrar

---

## Referencias
- [BILLING.md](./BILLING.md)
- [MONETIZATION_ARCHITECTURE.md](./MONETIZATION_ARCHITECTURE.md)
- [DEPLOYMENT.md](./DEPLOYMENT.md)
- [KNOWN_ISSUES.md](./KNOWN_ISSUES.md)
- [CHANGE_IMPLEMENTATION_PROTOCOL.md](./CHANGE_IMPLEMENTATION_PROTOCOL.md)
