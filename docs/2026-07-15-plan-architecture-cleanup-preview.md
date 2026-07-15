# Limpieza y alineación de la arquitectura de planes — Preview

Fecha: 2026-07-15

Entorno principal trabajado: Supabase Preview y rama `preview`.

## Objetivo

Alinear y simplificar la arquitectura de planes de GeoField GPS para que toda la plataforma trabaje únicamente con los planes oficiales:

- `free`
- `pro`
- `enterprise`

También se buscó eliminar referencias legacy a:

- `starter`
- `elite`
- `elite_plus`

El trabajo se realizó sin hacer push a `main` y sin ejecutar cambios de base de datos en Producción.

## Reglas operativas respetadas

- Se trabajó únicamente sobre la rama `preview`.
- No se hizo push a `main`.
- Los cambios SQL se ejecutaron manualmente en Supabase Preview.
- No se utilizó `supabase db push`.
- La lógica DEMO se mantuvo exclusiva de Preview.
- No se ejecutaron migraciones de base de datos en Producción.
- El deployment de Preview fue promovido al alias estable solo después de validación.

## Estado oficial de planes

Los planes oficiales quedaron definidos de esta manera:

| Plan       | Geocercas máximas | Trackers máximos | Precio mensual |
| ---------- | -----------------: | ---------------: | -------------: |
| free       |                  1 |                2 |          USD 0 |
| pro        |                 25 |               10 |         USD 29 |
| enterprise |                250 |               50 |         USD 99 |

## Fuente de verdad comercial

La fuente comercial oficial del plan de una organización es:

```text
public.org_billing.plan_code
```

La columna:

```text
public.organizations.plan
```

se mantiene como copia legacy sincronizada para compatibilidad.

La tabla:

```text
public.plans
```

se utiliza como catálogo oficial de planes y fuente operacional de límites.

## Cambios realizados

### 1. Alineación de límites de planes

Se alinearon los límites operativos con los valores oficiales:

- Free: 1 geocerca y 2 trackers.
- Pro: 25 geocercas y 10 trackers.
- Enterprise: 250 geocercas y 50 trackers.

La vista o lógica de `org_entitlements` pasó a leer los límites desde `public.plans`.

La tabla legacy `public.plan_limits` fue eliminada después de validar que ya no era necesaria.

### 2. Alineación de `public.plans`

La tabla `public.plans` quedó con tres filas oficiales:

- `free`
- `pro`
- `enterprise`

Los valores de precio y límites quedaron consistentes con la configuración comercial de la aplicación.

### 3. Alineación de `organizations.plan`

Se corrigió la columna legacy `public.organizations.plan`:

- Default cambiado a `free`.
- Valores existentes sincronizados desde `public.org_billing.plan_code`.
- Se configuró sincronización desde `org_billing`.
- La función `bootstrap_user_context()` fue ajustada para crear organizaciones personales nuevas con plan `free`.

### 4. Dataset DEMO de Preview

La función:

```text
public.load_demo_preview_dataset(uuid)
```

fue ajustada para usar:

```text
enterprise
```

en lugar del valor legacy `starter`.

Se conservó la protección:

```sql
if current_setting('app.env', true) = 'production' then
  raise exception 'Demo seed disabled in production';
end if;
```

La organización `DEMO Agro Preview` fue validada con:

- `plan_code = enterprise`
- `subscribed_plan_code = enterprise`
- `plan_status = active`

También se verificó que la función DEMO ya no contenga referencias a:

- `starter`
- `elite`
- `elite_plus`

### 5. Alineación de Google Play

La función:

```text
public.get_best_plan_from_play(uuid)
```

fue reemplazada para reconocer únicamente:

- `free`
- `pro`
- `enterprise`

Ranking final:

| Plan       | Ranking |
| ---------- | ------: |
| free       |       0 |
| pro        |      20 |
| enterprise |      30 |

La función valida los productos contra `public.plans` y considera únicamente compras activas y no vencidas.

No se creó ningún trigger que actualice directamente `organizations.plan`.

La función:

```text
public.apply_org_plan_from_play(uuid, uuid)
```

se mantuvo como responsable de aplicar el resultado en `public.org_billing`.

### 6. Auditoría del enum `public.plan_code`

El enum original contenía:

- `starter`
- `pro`
- `enterprise`
- `free`
- `elite`
- `elite_plus`

Se auditaron sus dependencias y se confirmó que estaba utilizado por:

- `public.organizations.plan`
- `public.plans.code`
- `public.play_products.plan_code`
- `public.get_best_plan_from_play(uuid)`
- `public.apply_org_plan_from_play(uuid, uuid)`

También se verificó que:

- No existían datos activos con valores legacy.
- No existían claves foráneas hacia `public.plans(code)`.
- No existían vistas dependientes.
- No existían vistas materializadas dependientes.
- `public.plans.code` conservaba su clave primaria.
- `public.play_products.plan_code` conservaba su índice.

### 7. Reconstrucción de `public.plan_code`

Se creó y ejecutó en Preview una migración transaccional que:

1. Validó que no existieran valores inesperados.
2. Eliminó temporalmente las dos funciones dependientes.
3. Retiró temporalmente el default de `organizations.plan`.
4. Creó un enum nuevo con:
   - `free`
   - `pro`
   - `enterprise`
5. Migró las tres columnas al enum nuevo.
6. Eliminó el enum anterior.
7. Renombró el enum nuevo a `public.plan_code`.
8. Restauró el default `free`.
9. Recreó las funciones de Google Play.
10. Validó el contenido final del enum.

Resultado final:

| enumlabel  | enumsortorder |
| ---------- | ------------: |
| free       |             1 |
| pro        |             2 |
| enterprise |             3 |

### 8. Seguridad de funciones

Después de recrear las funciones, se detectó que Supabase había concedido permisos explícitos a:

- `anon`
- `authenticated`

Se corrigieron los permisos para que solo puedan ejecutar las funciones:

- `postgres`
- `service_role`

Funciones corregidas:

```text
public.get_best_plan_from_play(uuid)
public.apply_org_plan_from_play(uuid, uuid)
```

Estado final de permisos:

```text
postgres=X/postgres
service_role=X/postgres
```

## Validaciones finales

### Datos por plan

Se verificó que los datos existentes se conservaran:

| Fuente              | Valor      | Filas |
| ------------------- | ---------- | ----: |
| organizations.plan  | enterprise |     2 |
| organizations.plan  | free       |     1 |
| organizations.plan  | pro        |     1 |
| plans.code          | enterprise |     1 |
| plans.code          | free       |     1 |
| plans.code          | pro        |     1 |

### Organizaciones verificadas

Se validaron organizaciones de prueba en Preview, incluyendo:

- `DEMO Agro Preview`
- `pmunoz03`
- `pruebatugeo`
- `ruebageo`

La organización `ruebageo` conserva su override intencional de trackers.

## Archivos principales creados o modificados

```text
supabase/migrations/20260714000600_align_get_best_plan_from_play_preview.sql
supabase/migrations/20260714000700_rebuild_plan_code_enum_preview.sql
supabase/sql/load_demo_preview_dataset.sql
docs/2026-07-14-align-get-best-plan-from-play-preview.md
docs/2026-07-14-align-legacy-organization-plan-preview.md
docs/2026-07-14-rebuild-plan-code-enum-preview.md
```

## Deploy y promoción

- Los cambios fueron enviados a la rama `preview`.
- Los deployments de Vercel Preview fueron validados.
- El último deployment de Preview fue promovido correctamente al alias estable.
- No se hizo merge ni push a `main`.

## Estado de Producción

La promoción en Vercel actualizó el deployment de la aplicación, pero no aplicó cambios de base de datos en Supabase Producción.

Por tanto:

- El código desplegado está actualizado.
- Supabase Producción todavía requiere una migración específica, auditada y ejecutada por separado.
- No debe asumirse que Producción ya tiene el enum reconstruido.
- La función DEMO no debe ejecutarse ni trasladarse a Producción.

## Resultado arquitectónico

La arquitectura de planes quedó simplificada y consistente:

- Solo existen tres planes oficiales.
- Los límites se leen desde un catálogo único.
- La fuente comercial sigue siendo `org_billing.plan_code`.
- La columna legacy de organizaciones se mantiene sincronizada.
- Google Play usa el mismo catálogo oficial.
- Las funciones sensibles están restringidas a `service_role`.
- Se eliminaron referencias activas a planes legacy en Preview.
