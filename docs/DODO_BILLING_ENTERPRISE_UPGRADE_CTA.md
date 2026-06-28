# Billing: botón Upgrade to Enterprise para PRO activo sobre límite (Preview)

## Fecha
2026-06-28

## Alcance
Branch `preview` solamente. No se toca Producción.

## Problema
Después de activar una organización como PRO por Dodo TEST, `/billing` ocultó correctamente el botón `Suscribirme a PRO`, pero cuando la organización excedía límites del plan PRO el CTA inferior seguía mostrando una acción genérica y no permitía upgrade directo a Enterprise.

## Cambio aplicado
En `src/pages/Billing.jsx` se agregó `canUpgradeToEnterprise`, verdadero cuando:

- `effectivePlanCode = pro`
- `effectivePlanStatus` está en `active`, `trialing`, `past_due` o `paused`

Cuando `canUpgradeToEnterprise` es verdadero:

- El banner de plan actual muestra botón `Upgrade to Enterprise`.
- El bloque de `over_limit` muestra botón `Upgrade to Enterprise`.
- El botón llama `UpgradeToProButton` con `plan="enterprise"`, `orgId={currentOrgId}` y label específico.

## Resultado esperado
- Organización PRO activa: no muestra `Suscribirme a PRO`.
- Organización PRO activa sobre límite: muestra `Upgrade to Enterprise`.
- Organización Enterprise activa: no muestra botón de upgrade.
- Organización free/inactiva: conserva flujo normal hacia planes/upgrade.

## Nota operativa
En Preview TEST, este botón abre checkout Enterprise mediante la función Dodo ya integrada. Antes de Producción se debe validar el flujo comercial definitivo para upgrades/cancelaciones, para evitar dobles suscripciones si el proveedor no hace cambio de plan in-place.

## Seguridad
- No modifica base de datos.
- No modifica Edge Functions.
- No modifica secrets.
- No toca Producción.
- No hace Promote.
