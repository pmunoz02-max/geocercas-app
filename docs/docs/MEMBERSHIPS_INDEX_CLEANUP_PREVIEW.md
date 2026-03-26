# Memberships Index Cleanup (Preview)

## Objetivo
Reducir redundancia de índices en `memberships` sin cambiar reglas funcionales.

## Índices eliminados
- memberships_one_default_per_user_uk
- ux_memberships_one_default_per_user
- idx_memberships_user_org

## Motivo
- Existían duplicados exactos o redundantes
- Se conservan los índices funcionales críticos:
  - PK memberships_pkey
  - memberships_user_org_uniq
  - ux_memberships_user_org_active
  - memberships_one_default_per_user
  - memberships_one_default_per_user_active
  - idx_memberships_tracker_vigente

## Alcance
- Solo preview
- Sin cambios de semántica de negocio
- Sin cambios en producción