# Matriz oficial de límites de planes — Preview

Fecha: 2026-07-14

Entorno: Supabase Preview únicamente.

## Objetivo

Definir la matriz oficial de límites para los planes comerciales activos de GeoField GPS.

## Matriz aprobada

| Plan | Máximo de geocercas | Máximo de trackers |
|---|---:|---:|
| Free | 1 | 2 |
| PRO | 25 | 10 |
| Enterprise | 250 | 50 |

## Fuente operativa actual

La fuente operativa actual en Preview es la vista `public.org_entitlements`, construida desde `public.org_billing` y `public.plans`.

La cadena vigente es:

```text
org_billing.plan_code
    ↓
plans.code
    ↓
org_entitlements
    ↓
public.get_max_trackers(uuid) / enforcement
```

La definición efectiva en Preview es equivalente a:

```sql
select
  b.org_id,
  b.plan_code,
  p.geofence_limit as max_geocercas,
  coalesce(b.tracker_limit_override, p.tracker_limit) as max_trackers
from public.org_billing b
join public.plans p
  on p.code::text = b.plan_code;
```

Esto significa que:
- `org_billing.plan_code` se une a `plans.code`
- `org_entitlements` obtiene `geofence_limit` y `COALESCE(tracker_limit_override, tracker_limit)`
- `get_max_trackers_for_org` consulta esa vista para resolver el cupo real

Nota de verificación directa en BD Preview (2026-09-08):
- la vista `public.org_entitlements` y la lógica de `public.get_max_trackers(uuid)` se revisaron directamente contra la base Preview del 2026-09-08
- la matriz confirmada sigue siendo: FREE 1/2, PRO 25/10, Enterprise 250/50
- la fecha histórica del documento permanece en 2026-07-14, pero la verificación directa en Preview del 2026-09-08 confirma que la regla vigente sigue alineada con esa matriz