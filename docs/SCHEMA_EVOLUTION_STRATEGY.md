SCHEMA_EVOLUTION_STRATEGY.md
# SCHEMA_EVOLUTION_STRATEGY

Este documento define la estrategia oficial para evolucionar el modelo de datos del sistema **App Geocercas** de forma segura, escalable y compatible con el sistema en producción.

El objetivo es permitir:

- evolución del schema sin romper producción
- compatibilidad entre versiones del sistema
- migraciones seguras en Supabase/PostgreSQL
- eliminación progresiva de estructuras legacy
- mantenimiento de la seguridad multi-tenant

---

# Principio Fundamental

El schema de base de datos es **parte crítica de la arquitectura del sistema**.

Los cambios en el schema pueden afectar:

- pipelines de tracking
- generación de eventos
- seguridad multi-tenant
- RLS
- integraciones móviles
- consultas del frontend
- analytics del sistema

Por lo tanto:

**ningún cambio de schema debe hacerse sin entender completamente su impacto.**

---

# Fuente de Verdad del Schema

La referencia principal del modelo de datos es:


docs/DB_SCHEMA_MAP.md


Este documento debe reflejar siempre:

- tablas existentes
- columnas principales
- relaciones
- vistas
- RPC SQL
- estructuras legacy
- estructuras canónicas

Toda migración debe actualizar este documento.

---

# Tipos de Cambios en el Schema

Los cambios en el modelo de datos se clasifican en 4 categorías.

---

## 1️⃣ Cambios Seguros (Safe Changes)

Cambios que **no rompen compatibilidad**.

Ejemplos:

- agregar columnas opcionales
- agregar índices
- agregar nuevas tablas
- agregar vistas
- agregar RPC SQL
- agregar nuevas políticas RLS

Ejemplo:

```sql
ALTER TABLE positions
ADD COLUMN accuracy numeric;

Estos cambios pueden desplegarse sin riesgo inmediato.

2️⃣ Cambios Compatibles (Backward Compatible)

Cambios que requieren adaptación gradual.

Ejemplos:

agregar nueva tabla que reemplazará una legacy

agregar nueva columna que luego sustituirá otra

agregar nueva vista que reemplaza una consulta existente

Proceso recomendado:

introducir nueva estructura

adaptar código

migrar datos

eliminar estructura antigua

3️⃣ Cambios Riesgosos (Risky Changes)

Cambios que pueden romper partes del sistema.

Ejemplos:

modificar tipo de columna

modificar claves primarias

modificar claves foráneas

modificar RLS

Ejemplo:

ALTER TABLE positions
ALTER COLUMN latitude TYPE double precision;

Estos cambios requieren:

análisis previo

pruebas en preview

plan de rollback

4️⃣ Cambios Destructivos (Breaking Changes)

Cambios que rompen compatibilidad directamente.

Ejemplos:

DROP COLUMN

DROP TABLE

renombrar columnas usadas en producción

renombrar tablas activas

Ejemplo:

DROP TABLE tracker_positions;

Estos cambios solo pueden hacerse después de una migración completa.

Estrategia de Migración Segura

Para cambios estructurales se usa el siguiente proceso:

Paso 1 — Introducir nueva estructura

Crear nueva tabla, columna o vista.

Ejemplo:

geofences

sin eliminar aún:

geocercas
Paso 2 — Adaptar el código

Actualizar:

backend

frontend

pipelines

RPC

queries

para usar la nueva estructura.

Paso 3 — Migrar datos

Copiar datos de la estructura antigua a la nueva.

Ejemplo:

geocercas → geofences
Paso 4 — Verificar estabilidad

Monitorear:

logs

métricas

consultas

RLS

Paso 5 — Deprecar estructura antigua

Marcar estructura como:

legacy

pero no eliminarla aún.

Paso 6 — Eliminación final

Solo después de confirmar que ningún sistema depende de ella.

Estrategia Legacy → Canonical

El sistema tiene coexistencia temporal entre modelos.

Ejemplo actual:

Canonical:

geofences
positions
tracker_geofence_events

Legacy:

geocercas
tracker_positions

Objetivo de largo plazo:

migrar completamente a:

canonical model

sin romper compatibilidad con datos históricos.

Versionado del Schema

Se recomienda mantener una versión del schema.

Ejemplo:

schema_version: v0.7

Actualizar cuando existan cambios estructurales.

Esto permite:

auditar cambios

rastrear migraciones

mantener compatibilidad.

Migraciones en Supabase

Todas las migraciones deben ejecutarse primero en:

preview

Nunca directamente en producción.

Proceso:

aplicar migración en preview

validar queries

validar RLS

validar pipelines

validar integraciones

Solo después considerar deploy a producción.

Validación de Migraciones

Antes de aplicar migraciones verificar:

impacto en RLS

impacto en consultas existentes

impacto en índices

impacto en pipelines de tracking

impacto en storage

RLS y Cambios de Schema

Las políticas RLS pueden depender de:

columnas

relaciones

vistas

Modificar el schema puede romper seguridad.

Por lo tanto:

cualquier cambio en tablas con RLS requiere revisión completa de políticas.

Impacto en Pipeline de Tracking

Tablas críticas:

positions
tracker_geofence_events
tracker_latest

Estas tablas participan en:

ingestión GPS

generación de eventos

estado del tracker

Cambios en estas tablas requieren análisis profundo.

Impacto en Retención de Datos

El sistema maneja grandes volúmenes de datos GPS.

Documentado en:

docs/TRACKING_DATA_RETENTION_POLICY.md

Migraciones deben considerar:

tamaño de tablas

impacto en índices

impacto en queries históricas.

Observabilidad durante migraciones

Durante cambios estructurales monitorear:

ingestión de posiciones

generación de eventos

latencia de consultas

consumo de CPU en Postgres

crecimiento de tablas

Estrategia de Rollback

Toda migración debe tener posibilidad de rollback.

Ejemplos:

mantener columnas antiguas temporalmente

mantener tablas legacy

evitar DROP inmediato.

Regla para IA y Copilot

IA assistants no deben generar migraciones destructivas automáticamente.

Antes de proponer cambios deben:

revisar DB_SCHEMA_MAP.md

confirmar estructura real

entender pipeline afectado

evaluar impacto multi-tenant

evaluar impacto RLS

Regla Final

El objetivo del proyecto es evolucionar el schema hacia:

mayor escalabilidad

mayor claridad del modelo

eliminación progresiva de legacy

mejor soporte SaaS

Pero siempre respetando:

estabilidad del sistema en producción.