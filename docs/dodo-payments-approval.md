# Dodo Payments — aprobación MoR y productos TEST

Fecha de documentación: 2026-06-25

## Resumen ejecutivo

Dodo Payments aprobó la cuenta de **FENICE ECUADOR S.A.S.** para operar como proveedor externo de cobro / Merchant of Record para App Geocercas / Geocercas GPS / GeoField GPS.

Estado confirmado por Dodo:

- Account Verification Forms: approved.
- Live payments: enabled / active.
- Payouts: enabled.
- UBO ID: aceptado.
- Tax document / RUC Ecuador: aceptado.
- Incorporation document: aceptado.

Este hito habilita continuar con la configuración e integración controlada de pagos web, pero **no significa que el checkout live ya deba estar activo dentro de la app**.

## Proveedor aprobado

- Proveedor: Dodo Payments.
- Función: Merchant of Record / proveedor externo de cobro, checkout, pagos y payouts.
- Empresa aprobada: FENICE ECUADOR S.A.S.
- País fiscal: Ecuador.
- Producto comercial: Geocercas GPS.
- Modelo: SaaS por suscripción.
- Canal de cobro: web only.
- Android: operativo únicamente, sin in-app purchases ni in-app payments.

## Posicionamiento aprobado para pagos

Mantener este encuadre en comunicaciones, UI y documentación:

> Geocercas GPS is an authorized workforce operations SaaS platform for geofence-based attendance, field activity verification, and operational reporting.

Usar términos seguros:

- authorized workforce operations
- geofence-based attendance
- field activity verification
- operational reporting
- invited or authorized trackers
- web-only subscriptions
- Android operational only

Evitar términos que puedan interpretarse como vigilancia personal o encubierta:

- covert tracking
- personal surveillance
- stalking
- spying
- tracking anyone
- monitoring people as consumers

La app debe mantener sus rutas legales públicas reforzadas:

- `/privacy`
- `/terms`
- `/refund-policy`
- `/authorized-location-use`
- `/location-privacy`
- `/gps-tracking-policy`

## Productos creados en Dodo TEST

Los siguientes productos fueron creados y validados visualmente en **Test Mode**.

| Plan | Product ID TEST | Precio | Tipo | Estado |
|---|---|---:|---|---|
| Geocercas GPS PRO | `pdt_0NhoMPN43aLOXnHSZhrTk` | USD 29/month | Subscription | TEST checkout validado |
| Geocercas GPS Enterprise | `pdt_0NhoND6E41RsKWVP43fW1` | USD 99/month | Subscription | TEST checkout validado |

Links TEST validados:

```txt
https://test.checkout.dodopayments.com/buy/pdt_0NhoMPN43aLOXnHSZhrTk?quantity=1
https://test.checkout.dodopayments.com/buy/pdt_0NhoND6E41RsKWVP43fW1?quantity=1
```

## Validación visual de checkout TEST

Se verificó visualmente que ambos checkouts muestran:

- Brand: Geocercas GPS.
- Product name correcto.
- Precio correcto:
  - PRO: USD 29 / Month.
  - Enterprise: USD 99 / Month.
- Etiqueta: Test Mode.
- Dodo Payments como Merchant of Record / online reseller.
- País de billing disponible: Ecuador.
- Sin uso de datos reales de tarjeta.

## Arquitectura obligatoria

La integración debe mantenerse proveedor-agnóstica.

```txt
App Geocercas
  ↓
Base de datos interna como fuente de verdad del plan
  ↓
Proveedor externo de cobro / checkout / eventos
  ↓
Dodo Payments
```

Reglas:

- La fuente de verdad del plan debe ser la base de datos interna.
- Dodo no debe ser hardcodeado como lógica comercial visible de la app.
- Dodo debe usarse como sistema externo de cobro, checkout, suscripciones y eventos.
- La UI debe usar textos neutrales:
  - proveedor de pagos
  - checkout seguro
  - portal de suscripción
  - subscription management
- No mezclar test con live.
- No mezclar preview con production.
- Android sigue sin pagos.

## Restricciones operativas

Hasta que exista una integración validada en preview:

- No activar checkout live dentro de producción.
- No configurar webhooks live sin plan técnico revisado.
- No pegar API keys, webhook secrets, setup keys, datos bancarios, QR 2FA ni recovery codes en chat.
- No subir capturas con secretos.
- No tocar Android.
- No hacer push a `main`.
- Trabajar solo en branch `preview`.
- Hacer Promote to Production solo con orden expresa del usuario.

## Próximo paso técnico recomendado

Antes de tocar código:

1. Documentar este hito en `/docs`.
2. Revisar dashboard Dodo sin exponer secretos.
3. Definir arquitectura proveedor-agnóstica de checkout.
4. Revisar ZIP actual de la app.
5. Implementar primero con links TEST o entorno TEST en branch `preview`.
6. Validar build local.
7. Push a `preview`.
8. Validar en Vercel Preview.
9. Solo después definir transición a live.

## Pendiente de implementación

- Crear o adaptar rutas web de pricing/checkout.
- Definir success/cancel URLs internas.
- Definir tabla/estructura interna de plan como fuente de verdad.
- Definir webhook Dodo TEST.
- Definir mapeo de eventos Dodo → estado interno.
- Definir portal de suscripción o flujo de gestión.
- Documentar transición TEST → LIVE.
- Validar con datos sintéticos antes de producción.

## Decisión

Dodo Payments pasa a ser el proveedor MoR principal aprobado para la siguiente fase de monetización web de App Geocercas.

Paddle y FastSpring quedan como alternativas o antecedentes, no como prioridad activa mientras Dodo avance correctamente.
