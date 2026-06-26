# Dodo checkout integration — Preview phase

Fecha: 2026-06-25  
Estado: Preview / Test checkout

## Objetivo

Integrar checkout externo para los planes SaaS de GeoField GPS sin acoplar la app a un proveedor específico y sin tocar pagos live, webhooks productivos ni Android.

## Alcance de esta fase

Esta fase habilita botones web de suscripción que redirigen a checkout externo en modo TEST.

No activa planes automáticamente en la base de datos. La fuente de verdad del plan sigue siendo la base de datos interna.

## Proveedor actual

Proveedor externo aprobado: Dodo Payments.

Uso operativo en esta fase:

- Dodo actúa como checkout externo en modo TEST.
- La UI usa copy neutral: “checkout seguro”, “suscribirse”, “portal de suscripción”.
- La arquitectura mantiene el patrón proveedor-agnóstico.

## Variables públicas de frontend

Estas variables no son secrets y pueden configurarse en Vercel Preview:

```env
VITE_BILLING_PROVIDER=external_checkout
VITE_CHECKOUT_MODE=test
VITE_CHECKOUT_PRO_URL=https://test.checkout.dodopayments.com/buy/pdt_0NhoMPN43aLOXnHSZhrTk?quantity=1
VITE_CHECKOUT_ENTERPRISE_URL=https://test.checkout.dodopayments.com/buy/pdt_0NhoND6E41RsKWVP43fW1?quantity=1
```

No colocar API keys, webhook secrets, claves live, códigos 2FA ni credenciales en archivos del repositorio ni en chats.

## Planes configurados

| Plan | Precio | Tipo | Checkout |
|---|---:|---|---|
| Geocercas GPS PRO | USD 29/month | Subscription | TEST |
| Geocercas GPS Enterprise | USD 99/month | Subscription | TEST |

## Archivos modificados

- `src/config/billingCheckout.ts`
- `src/components/Billing/UpgradeToProButton.tsx`
- `docs/DODO_CHECKOUT_PREVIEW_INTEGRATION.md`
- `docs/README.md`
- `docs/BILLING.md`
- `docs/MONETIZATION_ARCHITECTURE.md`

## Comportamiento

Los botones existentes `UpgradeToProButton` ya no invocan la Edge Function legacy de Paddle en esta fase. Ahora leen URLs públicas de checkout externo y redirigen al usuario al checkout seguro.

El componente acepta `plan="pro"` o `plan="enterprise"` y conserva el texto neutral de la interfaz.

## Qué NO hace esta fase

- No crea webhooks.
- No usa API keys.
- No activa planes automáticamente.
- No toca Android.
- No cambia RLS ni tablas.
- No toca producción por defecto.
- No elimina documentación legacy de Paddle; solo la deja como referencia histórica.

## Validación en Preview

1. Confirmar branch `preview`.
2. Configurar variables públicas en Vercel Preview si no se usan los defaults test.
3. Ejecutar `npm run build`.
4. Hacer push a `preview`.
5. Validar `/pricing` y `/billing` en Vercel Preview.
6. Confirmar que los botones abren URLs `https://test.checkout.dodopayments.com/...`.
7. No ingresar tarjetas reales.
8. No hacer Promote a Production sin orden expresa.

## Siguiente fase

La activación automática del plan se hará después mediante webhooks y mapeo interno de eventos, siempre manteniendo la base de datos interna como fuente de verdad.

## Public pricing page for checkout validation

Added a public, provider-agnostic pricing page:

- `/pricing`
- `/precios`

Purpose:

- Show both checkout options independently from the user's current plan.
- Allow testing both PRO and Enterprise checkout links from Vercel Preview.
- Provide a neutral public sales page that does not expose the payment provider as part of the app UI.

Plans shown:

- Geocercas GPS PRO — USD 29/month
- Geocercas GPS Enterprise — USD 99/month

Rules:

- The page uses the same provider-agnostic checkout configuration in `src/config/billingCheckout.ts`.
- The page does not use API keys, webhook secrets, or provider-specific SDKs.
- Android remains operational only and is not modified.
- Live checkout must not be enabled until explicitly authorized.


## Fix preview 2026-06-25: navegación e integridad de payment links

Se aplicó una corrección para mantener la integración en Preview sin afectar Producción:

- `Login.tsx` usa `window.location.replace()` después del login exitoso para que `/login` no quede en el historial anterior a `/inicio`.
- `Login.tsx` redirige con `replace()` si el usuario vuelve manualmente a `/login` teniendo sesión activa.
- `UpgradeToProButton.tsx` usa el payment link exacto del proveedor en Test Mode, sin agregar parámetros `org_id` o `plan`, para evitar errores `/error/not-found`.
- `billingCheckout.ts` limpia espacios en variables públicas `VITE_CHECKOUT_*_URL`.

No se agregaron API keys, webhooks, LIVE checkout, cambios de base de datos ni cambios Android.

## Corrección de rutas públicas `/pricing` y `/precios` (Preview)

Se detectó una página estática legacy en `public/pricing/index.html`.

Debido a que `vercel.json` prioriza los archivos físicos antes del fallback de la SPA, una carga directa o una ventana de incógnito abría esa página antigua, mientras que la navegación interna de React mostraba la nueva página de precios.

Corrección permanente:

- eliminar `public/pricing/index.html`;
- eliminar el directorio `public/pricing/` si queda vacío;
- eliminar `public/precios/index.html` si existiera como remanente legacy;
- mantener `/pricing` y `/precios` exclusivamente como rutas React de `PublicPricing`;
- validar siempre mediante carga directa, recarga forzada y ventana de incógnito.

Esta corrección no modifica pagos LIVE, API keys, webhooks, Android ni Producción.
