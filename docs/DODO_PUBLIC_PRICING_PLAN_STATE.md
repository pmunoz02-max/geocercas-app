# Dodo Preview: estado de plan en página pública de precios

Fecha: 2026-06-28
Entorno afectado: Preview únicamente (`mujwsfhkocsuuahlrssn`).
Producción no fue tocada.

## Motivo

El flujo Dodo TEST ya actualiza `org_billing` correctamente mediante el webhook firmado `dodo-webhook`, pero la ruta pública `/pricing` usa `PublicPricing.jsx` y no leía el estado actual de la organización. Por eso el botón `Suscribirse a PRO` seguía visible aunque `org_billing.plan_code = pro`, `billing_provider = dodo` y `plan_status = active`.

## Cambio aplicado

`src/pages/PublicPricing.jsx` ahora:

- Lee `authenticated` y `currentOrgId` desde `useAuth()`.
- Consulta `public.org_billing` para la organización actual.
- Reconoce planes pagados activos con `plan_status in ('active', 'trialing')`.
- Muestra `Plan actual` cuando el plan de la tarjeta coincide con el plan activo.
- Reemplaza el checkout del plan actual por un enlace a `/billing`.
- Evita abrir checkout cuando no hay sesión u organización actual.
- Mantiene disponible Enterprise como upgrade cuando la organización está en PRO.

## Validación esperada

Después de deploy Preview:

1. Entrar a `/pricing` autenticado y con organización activa.
2. Si la organización tiene PRO activo por Dodo, la tarjeta PRO debe mostrar `Plan actual`.
3. El botón `Suscribirse a PRO` debe desaparecer o quedar reemplazado por `Ver facturación`.
4. La tarjeta Enterprise puede seguir mostrando checkout si se permite upgrade.

## Notas

Este cambio solo corrige la lectura visual/funcional del estado comercial en `/pricing`. No cambia el webhook, no modifica `org_billing` y no afecta Stripe/Paddle.
