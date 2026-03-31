# Tracker Limit Enforcement (Preview)

## Contexto

Se implementa enforcement real de límites de trackers por plan en backend.

## Fuente de verdad

- Tabla: `public.org_entitlements`
- Campo: `max_trackers`

## Enforcement

El control se realiza en:

- `public.rpc_upsert_tracker_assignment`

## Lógica

1. Resolver `org_id`
2. Obtener `max_trackers`
3. Contar trackers activos:
   - `count(distinct tracker_user_id)`
   - `tracker_assignments.active = true`
4. Si supera límite:
   - Se lanza excepción `TRACKER_LIMIT_REACHED`

## Helpers alineados

- `count_active_trackers(p_org_id)`
- `get_max_trackers_for_org(p_org_id)`

## Decisiones

- ❌ No usar `org_billing` para enforcement
- ✅ Backend como única fuente de control
- ✅ Frontend solo refleja error

## Estado

- Implementado en preview
- Validado con datos reales