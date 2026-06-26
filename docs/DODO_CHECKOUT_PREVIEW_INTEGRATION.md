# Dodo checkout — integración y validación en Preview

Fecha de cierre: 2026-06-26  
Estado: **VALIDADO EN PREVIEW / TEST MODE**  
Producción: **no modificada por esta fase**

## Objetivo

Integrar una página pública de precios y checkouts externos para los planes SaaS de GeoField GPS, manteniendo la app desacoplada del proveedor de pagos.

La base de datos interna continúa siendo la fuente de verdad del plan. Dodo Payments actúa únicamente como proveedor externo de checkout, cobro, suscripciones, eventos y payouts.

## Alcance implementado

- Página pública neutral de precios:
  - `/pricing`
  - `/precios`
- Plan PRO: USD 29 por mes.
- Plan Enterprise: USD 99 por mes.
- Checkout externo en Dodo Test Mode.
- Configuración centralizada y proveedor-agnóstica.
- Sin API keys en frontend.
- Sin webhooks.
- Sin activación automática de planes.
- Sin cambios en tablas, RLS, Supabase ni Android.

## Productos TEST confirmados

| Plan | Product ID TEST | Precio | Periodicidad | Estado |
|---|---|---:|---|---|
| Geocercas GPS PRO | `pdt_0NhoMPN43aL0XnHSZhrTk` | USD 29 | 1 mes | Validado |
| Geocercas GPS Enterprise | `pdt_0NhoND6E41RsKWVP43fW1` | USD 99 | 1 mes | Validado |

Links TEST:

```txt
https://test.checkout.dodopayments.com/buy/pdt_0NhoMPN43aL0XnHSZhrTk?quantity=1
https://test.checkout.dodopayments.com/buy/pdt_0NhoND6E41RsKWVP43fW1?quantity=1
```

**Regla operativa:** copiar los Product IDs y payment links directamente desde Dodo. No transcribir manualmente caracteres visualmente ambiguos como `0` y `O`.

## Variables públicas de Preview

Estas variables no son secretos, pero deben configurarse únicamente para el ambiente **Preview** mientras se use Test Mode:

```env
VITE_BILLING_PROVIDER=external_checkout
VITE_CHECKOUT_MODE=test
VITE_CHECKOUT_PRO_URL=https://test.checkout.dodopayments.com/buy/pdt_0NhoMPN43aL0XnHSZhrTk?quantity=1
VITE_CHECKOUT_ENTERPRISE_URL=https://test.checkout.dodopayments.com/buy/pdt_0NhoND6E41RsKWVP43fW1?quantity=1
```

No colocar API keys, webhook secrets, credenciales bancarias, códigos 2FA ni recovery codes en el repositorio, frontend o chat.

## Arquitectura frontend

Archivos principales:

- `src/config/billingCheckout.ts`
- `src/components/Billing/UpgradeToProButton.tsx`
- `src/pages/PublicPricing.jsx`
- `src/App.jsx`

Comportamiento:

1. La página pública presenta ambos planes sin depender del plan actual del usuario.
2. Los botones consultan una configuración centralizada.
3. La app abre el payment link exacto del plan.
4. No se agregan parámetros propios como `org_id` o `plan` al enlace externo en esta fase.
5. La UI usa textos neutrales: “Suscribirse”, “checkout seguro” y “proveedor de pagos”.

## Corrección de rutas públicas

### Causa raíz

Existía una página estática legacy:

```txt
public/pricing/index.html
```

`vercel.json` prioriza archivos físicos antes del fallback de la SPA. Por ello:

- la navegación interna React mostraba la página nueva;
- una carga directa, recarga o ventana de incógnito mostraba la página estática antigua.

### Corrección permanente

- Se eliminó `public/pricing/index.html`.
- Se eliminó `public/precios/index.html` si existía.
- `/pricing` y `/precios` quedan exclusivamente como rutas React de `PublicPricing`.
- La validación debe incluir siempre carga directa, recarga forzada e incógnito.

## Navegación de autenticación

Se aplicó una protección para evitar que `/login` quede como destino intermedio después del ingreso:

- redirección post-login mediante `window.location.replace()`;
- si un usuario con sesión activa vuelve a `/login`, la app reemplaza esa ruta por `/inicio` o por un `next` permitido.

Esta protección debe conservarse en futuras modificaciones de autenticación.

## Validación completada

Validado en Vercel Preview:

- `/pricing` carga la página React nueva mediante acceso directo.
- `/precios` carga la misma página React nueva.
- PRO abre Dodo Test Mode con USD 29/month.
- Enterprise abre Dodo Test Mode con USD 99/month.
- País Ecuador disponible en el checkout.
- No se usaron tarjetas reales.
- Producción conserva su implementación anterior y no recibió esta fase.

## Rutas neutrales de retorno

Se incorporaron tres rutas públicas y proveedor-agnósticas:

- `/billing/return`
- `/billing/success`
- `/billing/cancel`

Comportamiento:

- `/billing/return`: regreso neutral desde el checkout. No confirma pago ni modifica plan.
- `/billing/success`: pantalla informativa de finalización. En esta fase TEST no valida pago, no activa plan y no escribe en la base de datos.
- `/billing/cancel`: informa que el checkout no se completó. No cancela suscripciones existentes ni modifica el plan.

Las tres rutas:

- están fuera de `AuthGuard`;
- no requieren sesión;
- no usan API keys;
- no llaman webhooks;
- no consultan ni modifican tablas;
- conservan el parámetro `lang` para ES, EN y FR;
- permiten volver a `/pricing` o al inicio.

La mera visita a cualquiera de estas rutas nunca debe considerarse evidencia de pago. La base de datos interna continúa siendo la fuente de verdad del plan.

## Redirect TEST configurado en Dodo

Fecha de validación: 2026-06-26  
Ambiente: **Dodo Test Mode + Vercel Preview**

Se configuró en Dodo Test Mode la URL de retorno neutral:

```txt
https://preview.tugeocercas.com/billing/return?lang=es
```

La configuración se aplicó en los payment links de los productos TEST:

- Geocercas GPS PRO — USD 29/month.
- Geocercas GPS Enterprise — USD 99/month.

Validación completada:

- PRO → completar/salir del flujo TEST → `/billing/return?lang=es`.
- Enterprise → completar/salir del flujo TEST → `/billing/return?lang=es`.

Esta ruta de retorno es deliberadamente neutral: no confirma pago, no activa planes y no escribe en la base de datos. La activación real de suscripciones seguirá dependiendo de una fase posterior con verificación server-side/webhooks TEST e idempotencia.

Reglas para esta fase:

- no usar `/billing/success` como evidencia de pago;
- no confiar en una visita manual a `/billing/return`, `/billing/success` o `/billing/cancel`;
- no configurar redirects LIVE todavía;
- no modificar Production;
- no agregar API keys ni webhook secrets.

## Fuera de alcance

- Checkout LIVE.
- API keys o SDK privado.
- Webhooks TEST o LIVE.
- Activación automática de planes.
- Portal de suscripción.
- Cambios en `org_billing` u otras tablas.
- Cambios en Android.
- Promote a Production.

## Siguiente fase propuesta

1. Diseñar el flujo de verificación server-side para eventos TEST.
2. Definir idempotencia, mapeo de productos externos hacia planes internos y manejo de reintentos.
3. Auditar primero la estructura real de billing antes de proponer SQL o modificar tablas.
4. Solo después implementar webhooks TEST y activación interna controlada.

No implementar SQL ni cambios de tablas sin auditar previamente la estructura real de billing. No configurar checkout LIVE ni redirects LIVE sin orden expresa.

## Diseño posterior — webhooks TEST documentados (2026-06-26)

Después de validar checkout TEST y retorno neutral hacia `/billing/return`, se documentó la arquitectura futura de webhooks TEST.

Documentos relacionados:

- `DODO_WEBHOOKS_TEST_ARCHITECTURE.md`
- `WEBHOOKS.md`
- `BILLING_WEBHOOKS.md`
- `SUBSCRIPTIONS_ARCHITECTURE.md`

Estado de esa fase:

- diseñada;
- no implementada;
- bloqueada hasta recuperar acceso al proyecto Supabase `mujwsfhkocsuuahlrssn`;
- pendiente auditoría SQL read-only antes de cualquier cambio estructural.

Regla importante: `/billing/return`, `/billing/success` y `/billing/cancel` siguen siendo rutas informativas. Ninguna de estas rutas debe activar planes ni confirmar pagos. La confirmación real futura debe venir por webhook validado server-side e idempotente.
