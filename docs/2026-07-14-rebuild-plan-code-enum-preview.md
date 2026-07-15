# Reconstrucción de `public.plan_code` — Preview

Fecha: 2026-07-14

Entorno: Supabase Preview únicamente.

## Objetivo

Eliminar definitivamente del enum `public.plan_code` los valores legacy:

- `starter`
- `elite`
- `elite_plus`

El enum oficial queda limitado a:

| Plan       | Uso              |
| ---------- | ---------------- |
| free       | Plan gratuito    |
| pro        | Plan profesional |
| enterprise | Plan empresarial |

## Dependencias auditadas

Columnas que utilizan `public.plan_code`:

- `public.organizations.plan`
- `public.plans.code`
- `public.play_products.plan_code`

Funciones dependientes:

- `public.get_best_plan_from_play(uuid)`
- `public.apply_org_plan_from_play(uuid, uuid)`

También se confirmó que:

- `public.organizations.plan` tiene default `free`.
- `public.plans.code` es clave primaria.
- `public.play_products.plan_code` tiene índice.
- No existen claves foráneas hacia `public.plans(code)`.
- No existen vistas ni vistas materializadas dependientes del enum.
- No existen datos activos con valores legacy.

## Estrategia

La migración:

1. Valida que no existan valores inesperados en las tablas.
2. Elimina temporalmente las dos funciones dependientes.
3. Retira temporalmente el default de `organizations.plan`.
4. Crea un enum nuevo con `free`, `pro` y `enterprise`.
5. Convierte las tres columnas al enum nuevo.
6. Elimina el enum anterior.
7. Renombra el enum nuevo a `public.plan_code`.
8. Restaura el default y las funciones.
9. Valida el contenido final del enum.

## Archivo

```text
supabase/migrations/20260714000700_rebuild_plan_code_enum_preview.sql
```

## Restricciones operativas

- Ejecutar manualmente solo en Supabase Preview.
- No usar `supabase db push`.
- No ejecutar en Producción.
- No hacer push a `main`.
- Verificar el resultado antes del commit y del push a `preview`.
