# Skill: Database & Schema Control

## Objetivo
Mantener consistencia, integridad y estabilidad en la base de datos (Supabase/Postgres) evitando errores estructurales y parches manuales.

---

## Regla crítica

```txt
NUNCA modificar lógica sin conocer estructura real de la tabla
Principio base

La base de datos es la fuente de verdad.

Si la DB está mal → toda la app está mal
Flujo correcto antes de cambios

Antes de:

modificar queries
escribir funciones
arreglar bugs de datos
crear migraciones

SIEMPRE ejecutar:

select
  table_name,
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
order by table_name, ordinal_position;
Regla universal de tablas críticas

Tablas clave:

auth.users
personal
organizations
organization_members
tracker_invites
positions / tracker_positions
subscriptions / billing
Regla personal (CRÍTICA)
personal.user_id debe existir y estar sincronizado con owner_id

Nunca romper esta relación.

Relaciones obligatorias
auth.users.id → personal.owner_id
personal.user_id → tracking.user_id
organization_members → (user_id, org_id)
No hacer parches manuales

❌ Incorrecto:

update personal set user_id = 'x' where ...

✔️ Correcto:

encontrar causa raíz
corregir flujo que genera inconsistencia
Migraciones

Ubicación:

supabase/migrations/

Reglas:

una migración por cambio lógico
nombre claro
no sobrescribir migraciones existentes
no editar producción directamente
Funciones SQL (RPC)

Ubicación esperada:

supabase/functions/sql/

Reglas:

deben ser fuente única de lógica compleja
no duplicar lógica en frontend
documentar inputs/outputs
Versionado

Cada cambio estructural debe:

tener migración
tener update en /docs
probarse en preview
luego promover a producción
Errores comunes (ya vistos)
column does not exist

Causa:

asumir columnas
no inspeccionar tabla

Solución:

usar information_schema antes de tocar código
updated_at no existe

Causa:

asumir timestamps estándar

Solución:

usar created_at si es lo único disponible
o crear migración formal
token vs invite_token_hash

Causa:

mismatch entre frontend/backend

Solución:

usar nombre real de columna
Índices (importante para tracking)

Para tablas de posiciones:

index por user_id
index por timestamp
Reglas de integridad
no permitir registros huérfanos
validar foreign keys
validar org_id en cada relación
Pruebas obligatorias

Antes de push:

queries funcionan
no hay columnas inexistentes
joins correctos
inserts funcionan
no rompe endpoints existentes
Bugfix tracking

Formato:

## Bugfix YYYY-MM-DD - nombre

### Síntoma
...

### Causa raíz
...

### Solución permanente
...

### Tablas afectadas
- ...

### Prueba
- ...
Regla Copilot

Ejemplo:

Archivo: supabase/functions/sql/calculate_tracker_costs_preview.sql

Prompt:
No inventes columnas. Usa solo las existentes según schema.
No hacer
no ejecutar SQL a ciegas
no asumir columnas
no parchear datos manualmente
no mezclar lógica en frontend
no modificar producción directo
no duplicar estructuras

---

## 🚀 Push corto

```bash
git add docs/skills/database.md
git commit -m "docs: add database skill [allow-docs]"
git push origin preview