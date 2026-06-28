# Billing: ocultar CTA de upgrade para planes Dodo activos (Preview)

## Fecha
2026-06-28

## Alcance
Branch `preview` solamente. No se toca Producción.

## Problema
Después de activar una organización por Dodo TEST, `org_billing` queda correctamente en `plan_code = pro`, `plan_status = active` y `billing_provider = dodo`, pero `/billing` seguía mostrando el botón `Suscribirme a PRO`.

## Causa
La lógica de `showUpgradeCta` dependía de `ctaVariant`. Si la organización estaba sobre límite (`over_limit`) podía mostrar el CTA aunque el plan efectivo ya fuese pagado y activo.

## Cambio aplicado
En `src/pages/Billing.jsx`, el bloque superior de Billing ahora calcula `hasPaidPlanAccess` con:

- `effectivePlanCode` en `pro` o `enterprise`
- `effectivePlanStatus` en `active`, `trialing`, `past_due` o `paused`

Si `hasPaidPlanAccess` es verdadero, se muestra el banner de plan actual y se oculta el botón de suscripción a PRO. El CTA de upgrade queda reservado para organizaciones free/inactivas.

## Resultado esperado
- PRO activo: muestra `Plan actual: Geocercas PRO` y oculta `Suscribirme a PRO`.
- Enterprise activo: muestra plan actual y oculta botones de suscripción.
- Free/inactivo: conserva botón de upgrade.

## Seguridad operativa
- No modifica base de datos.
- No modifica Edge Functions.
- No modifica secrets.
- No toca Producción.
- No hace Promote.
