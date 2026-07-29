# Inicialización automática de organizaciones FREE

Fecha: 2026-07-29
Entorno autorizado: `preview`
Proyecto Supabase: `mujwsfhkocsuuahlrssn`
Producción: sin cambios
Rama autorizada: `preview`

## Problema confirmado

El onboarding creaba filas en `organizations`, `org_members` y `memberships`,
pero no inicializaba `org_billing`. Como consecuencia, las organizaciones
nuevas aparecían con FREE únicamente por fallback de la interfaz y no generaban
correctamente sus derechos operacionales.

La auditoría confirmó además que:

- `org_entitlements` es una vista, no una tabla.
- La vista dependía del catálogo legacy `plan_limits`.
- El catálogo operacional oficial es `plans`.
- Había siete organizaciones sin `org_billing`.
- Las siete tenían `organizations.plan = 'free'` y no presentaban evidencia de
  suscripción.

## Solución preparada en la migración

Archivo:

`supabase/migrations/20260729090000_initialize_free_org_billing_preview.sql`

La migración:

1. Reconstruye `org_entitlements` con las columnas reales del catálogo
   `plans`: `code`, `geofence_limit` y `tracker_limit`. La definición es
   explícita y se reaplica en cada ejecución; no transforma dinámicamente la
   definición legacy con `pg_get_viewdef`. La unión usa `plans.code::text`
   porque `plans.code` es el enum `plan_code` y `org_billing.plan_code` es
   `text`.
2. Crea `initialize_free_org_billing()` como función `SECURITY DEFINER` con
   `search_path` fijo.
3. Crea un trigger `AFTER INSERT` en `organizations`.
4. Inicializa cada organización nueva con:
   - `plan_code = 'free'`
   - `plan_status = 'free'`
   - `subscribed_plan_code = 'free'`
   - `billing_provider = NULL`
5. Completa exclusivamente organizaciones existentes que:
   - no tienen `org_billing`; y
   - mantienen `organizations.plan = 'free'`.
6. Usa `ON CONFLICT (org_id) DO NOTHING` para conservar idempotencia.
7. Verifica los límites oficiales y detiene la transacción si detecta una
   inconsistencia.

## Límites oficiales comprobados

| Plan | Geocercas | Trackers |
| --- | ---: | ---: |
| FREE | 1 | 2 |
| PRO | 25 | 10 |
| Enterprise | 250 | 50 |

## Exclusiones deliberadas

- No elimina `public.plan_limits`; sus otras dependencias deben auditarse antes.
- No sobrescribe filas existentes de `org_billing`.
- No degrada organizaciones PRO o Enterprise.
- No modifica Paddle, Dodo ni suscripciones.
- No contiene referencias ni operaciones contra Supabase Producción.
- No hace push a `main`.

## Corrección posterior a la validación transaccional

La primera validación con `BEGIN` y `ROLLBACK` detectó que la versión inicial
conservaba nombres de columnas del catálogo legacy: `plan`, `max_geocercas` y
`max_trackers`. PostgreSQL revirtió toda la transacción; Preview no fue
modificada.

La migración fue corregida para usar:

- `plans.code`
- `plans.geofence_limit`
- `plans.tracker_limit`

También se eliminó la sustitución dinámica de `plan_limits` por `plans`.
Cambiar únicamente el nombre de la tabla conservaba las columnas legacy y
producía el error `column pl.plan does not exist`. La vista ahora se define
explícitamente y conserva su contrato de salida:

- `org_id`
- `plan_code`
- `max_geocercas`
- `max_trackers`

Debe repetirse la validación transaccional antes de aplicar la migración
original.

## Ejecución controlada

Antes de ejecutar, confirmar:

```powershell
git branch --show-current
Get-Content .\supabase\.temp\project-ref
```

La rama debe ser `preview` y el proyecto enlazado debe ser
`mujwsfhkocsuuahlrssn`.

Mientras el historial local y remoto de migraciones siga desalineado, no usar
`supabase db push`, `supabase migration repair` ni `supabase db pull`.

La aplicación directa únicamente en Preview se realizará después de que la
copia temporal terminada en `ROLLBACK` complete todas las validaciones:

```powershell
supabase db query --linked `
  --file .\supabase\migrations\20260729090000_initialize_free_org_billing_preview.sql
```

## Verificación funcional

Después de aplicar la migración:

1. Actualizar `preview.tugeocercas.com`.
2. Ingresar con la organización de prueba `Pietro`.
3. Confirmar que el Panel de costos muestra FREE sin alertas por ausencia de
   `org_billing` u `org_entitlements`.
4. Confirmar límites de 1 geocerca y 2 trackers.
5. Probar el checkout PRO únicamente con Paddle Sandbox.

## Reversión

No se incluye una reversión automática porque eliminar el trigger después de
crear nuevas organizaciones devolvería el defecto de onboarding. Si fuera
necesario revertir durante Preview:

1. Detener las pruebas.
2. Auditar las organizaciones creadas desde la aplicación de esta migración.
3. Restaurar la definición anterior de `org_entitlements`.
4. Eliminar el trigger y la función solamente mediante una migración de
   reversión revisada.

Las filas FREE creadas no deben borrarse automáticamente, porque podrían haber
adquirido relaciones o actividad después de su inicialización.

## Resultado verificado en Preview

- `enterprise / active`: 2 organizaciones.
- `free / free`: 8 organizaciones.
- `pro / trialing`: 1 organizaci�n.
- Organizaciones FREE sin `org_billing`: 0.
- Trigger instalado: `trg_initialize_free_org_billing`.
- Vista `org_entitlements` alineada con `public.plans`.
- L�mites resultantes:
  - FREE: 1 geocerca y 2 trackers.
  - PRO: 25 geocercas y 10 trackers.
  - Enterprise: 250 geocercas y 50 trackers.
- Historial local y remoto: `20260729090000`.
- Producci�n permaneci� intacta.
