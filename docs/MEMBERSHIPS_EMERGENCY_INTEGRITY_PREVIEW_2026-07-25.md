# Memberships emergency integrity intervention (Preview)

Date: 2026-07-25
Environment scope: Preview only
Migration: 20260725100000_emergency_membership_integrity_preview.sql

## Objetivo

Documentar la intervencion de emergencia aplicada en Preview para reforzar la integridad canonica de memberships y del flujo de tracker pairing, evitando degradaciones o inconsistencias de rol a nivel de base de datos y permisos de ejecucion.

## Controles aplicados

1. Integridad de owner en memberships mediante la funcion `public.enforce_membership_owner_integrity()` y tres triggers dedicados:
- `trg_memberships_owner_integrity_insert`
- `trg_memberships_owner_integrity_update`
- `trg_memberships_owner_integrity_delete`

2. Conservacion del control de limites de membresias existente:
- `trg_enforce_membership_limit`

3. Endurecimiento de RLS en `public.memberships` con el set vigente de cinco politicas:
- `memberships_select_own`
- `memberships_select_admin`
- `memberships_insert_admin`
- `memberships_update_admin`
- `memberships_delete_admin`

4. Ajuste auditado de permisos de funciones:
- `ensure_tracker_membership` (ambas firmas): solo `service_role`
- `is_org_admin` (ambas firmas): `authenticated` y `service_role`, no `anon`
- `rpc_claim_tracker_pairing_code`: `authenticated` y `service_role`, no `anon`

5. Actualizacion integral del RPC de tracker pairing para alinear alta/reactivacion de memberships y proyecciones legacy con el modelo canonico por organizacion.

## Verificacion posterior

La verificacion posterior de esta intervencion debe cubrir, como minimo:

1. Existencia y enlace correcto de los tres triggers de integridad de owner en `public.memberships`.
2. Presencia de `trg_enforce_membership_limit` activo.
3. Presencia del set de cinco politicas RLS vigentes en `memberships`.
4. Permisos efectivos de ejecucion en `ensure_tracker_membership`, `is_org_admin` y `rpc_claim_tracker_pairing_code` segun el alcance indicado arriba.
5. Validacion funcional de escenarios de integridad de rol (same-org y cross-org) usando el checklist operativo vigente.

Nota: este documento no registra resultados numericos de ejecucion; registra el alcance aplicado y los puntos de control a verificar.

## Archivos actualizados

1. `supabase/migrations/20260725100000_emergency_membership_integrity_preview.sql`
2. `docs/ARCHITECTURE_MEMBERSHIPS.md`
3. `docs/SECURITY_MODEL_AND_RLS_STRATEGY.md`
4. `docs/TEST_CHECKLIST_MEMBERSHIPS_ROLE_INTEGRITY.md`
5. `docs/MEMBERSHIPS_EMERGENCY_INTEGRITY_PREVIEW_2026-07-25.md`

## Restriccion de alcance (Preview vs Produccion)

Esta intervencion debe considerarse aplicada y auditada solo en Preview.

Queda expresamente prohibido asumir que esta migracion, estos permisos o estas politicas estan aplicados en Produccion sin evidencia independiente de despliegue, migracion ejecutada y verificacion posterior en ese entorno.
