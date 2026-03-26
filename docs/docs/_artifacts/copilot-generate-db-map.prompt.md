# Prompt: Generar DB_SCHEMA_MAP.md

Objetivo: generar o actualizar `docs/DB_SCHEMA_MAP.md` con un mapa tecnico y operativo del esquema de base de datos del proyecto.

## Fuentes obligatorias

1. `supabase/migrations/*.sql`
2. `supabase/sql/*.sql`
3. `_archive/prod_public_schema.sql`
4. Uso real en codigo:
- `api/**`
- `src/**`
- `server/**`

## Reglas de salida

- Idioma: espanol tecnico, claro y accionable.
- Incluir solo objetos del esquema `public` (salvo referencia puntual a `auth.users` cuando aplique).
- Diferenciar explicitamente:
- Objetos canonicos (uso actual)
- Objetos legacy/compat
- Documentar por dominio:
- Identidad/organizaciones
- Personal
- Geocercas/geofences
- Asignaciones/costos
- Tracking/asistencia
- Billing/configuracion
- Incluir:
- Tablas clave (PK, columnas criticas, FKs/relaciones)
- Vistas clave usadas por UI/API
- RPC/funciones SQL usadas desde codigo
- Notas de RLS y patrones de seguridad
- Notas de drift/deuda tecnica detectada

## Validaciones minimas antes de guardar

- Verificar que cada tabla/vista/RPC mencionada aparezca en SQL o en uso real del codigo.
- Marcar como "validar presencia en entorno" cualquier funcion referenciada por codigo pero no encontrada en el dump/migraciones.
- Evitar listas exhaustivas irrelevantes; priorizar objetos operativos.
- Mantener formato Markdown legible con secciones claras.

## Estructura recomendada

1. Fuentes usadas
2. Convenciones del mapa
3. Dominios y objetos
4. Vistas clave para UI/API
5. RPC/funciones SQL usadas por la app
6. Relaciones principales
7. Seguridad (RLS)
8. Notas de consistencia y deuda tecnica
