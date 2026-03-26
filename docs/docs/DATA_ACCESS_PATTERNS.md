DATA_ACCESS_PATTERNS.md
# DATA_ACCESS_PATTERNS

Este documento define los patrones oficiales de acceso a datos para **App Geocercas**.

Su objetivo es garantizar que las consultas del sistema sean:

- correctas
- seguras
- eficientes
- compatibles con RLS
- consistentes con la arquitectura multi-tenant
- escalables para tracking y geofencing

Este documento debe ser usado antes de implementar:

- queries SQL
- llamadas Supabase
- vistas
- RPC
- consultas para dashboards
- consultas para mapas
- consultas históricas
- listados administrativos

---

# Principio Fundamental

No toda tabla debe consultarse de la misma forma.

Cada tipo de dato tiene:

- propósito específico
- patrón de acceso recomendado
- restricciones de seguridad
- restricciones de performance

La IA y Copilot no deben generar queries genéricas sin considerar:

- multi-tenancy
- RLS
- volumen de datos
- rol de la tabla en la arquitectura

---

# Fuente de Verdad

Antes de escribir cualquier query revisar:

- docs/DB_SCHEMA_MAP.md
- docs/SYSTEM_BOUNDARIES.md
- docs/TRACKING_PERFORMANCE_STRATEGY.md
- docs/GEOFENCE_SCALING_STRATEGY.md
- docs/SECURITY_MODEL_AND_RLS_STRATEGY.md

---

# Reglas Generales de Acceso a Datos

## Regla 1 — Respetar multi-tenant

Toda consulta debe asumir que el sistema es multi-tenant.

La seguridad real se apoya en:

- org_id
- memberships
- RLS

La consulta nunca debe asumir acceso global.

---

## Regla 2 — No depender del frontend para seguridad

El frontend puede aplicar filtros visuales, pero el acceso real debe ser seguro incluso sin ellos.

No resolver seguridad con:

- filtros de UI
- estado local
- ocultamiento de componentes

---

## Regla 3 — No usar SELECT * por defecto

Evitar:

```sql
SELECT *
FROM positions;

Preferir seleccionar solo las columnas necesarias.

Ejemplo:

SELECT tracker_id, recorded_at, geom
FROM positions
WHERE tracker_id = :tracker_id;

Esto mejora:

rendimiento

claridad

estabilidad ante cambios de schema

Regla 4 — No consultar tablas de alto volumen sin filtro

Tablas como:

positions

tracker_geofence_events

no deben consultarse sin filtros claros.

Siempre filtrar por al menos uno de estos criterios:

org_id

tracker_id

rango temporal

geofence_id

paginación

Regla 5 — No mezclar legacy y canonical sin declararlo

Canonical:

geofences

positions

tracker_geofence_events

Legacy:

geocercas

tracker_positions

La IA no debe mezclar ambos modelos en una misma solución sin indicar explícitamente por qué.

Patrones Oficiales por Tipo de Consulta
1. Mapa principal de trackers
Objetivo

Mostrar trackers activos o última posición en mapa.

Patrón correcto

Consultar:

tracker_latest
Patrón incorrecto

Consultar directamente:

positions

para renderizar el mapa principal.

Motivo

tracker_latest existe para evitar scans pesados sobre historial.

Regla

Para vistas de estado actual, usar siempre la tabla resumida y no el historial bruto.

2. Historial de posiciones de un tracker
Objetivo

Mostrar recorrido o historial temporal de un tracker.

Patrón correcto

Consultar:

positions

filtrando por:

tracker_id

rango temporal

límite o paginación

Ejemplo conceptual
SELECT tracker_id, recorded_at, geom
FROM positions
WHERE tracker_id = :tracker_id
  AND recorded_at >= :from_ts
  AND recorded_at < :to_ts
ORDER BY recorded_at DESC
LIMIT :limit;
Patrón incorrecto

consultar sin rango temporal

consultar historial masivo sin límite

usar tracker_latest para reconstruir historial

3. Eventos de entrada y salida
Objetivo

Mostrar eventos ENTER / EXIT.

Patrón correcto

Consultar:

tracker_geofence_events

filtrando por:

tracker_id

geofence_id

rango temporal

organización

Patrón incorrecto

inferir eventos desde frontend

recalcular eventos desde positions para listados normales

mezclar historial GPS con eventos cuando ya existe persistencia oficial

4. Estado actual del tracker
Objetivo

Saber última ubicación, timestamp y estado actual.

Patrón correcto

Consultar:

tracker_latest
Patrón incorrecto

Buscar la última fila de positions en cada render o dashboard.

Motivo

Eso escala mal y duplica trabajo ya resuelto por la arquitectura.

5. Consulta de geocercas activas
Objetivo

Listar geocercas disponibles para una organización.

Patrón correcto

Consultar el modelo canónico:

geofences

filtrado por organización y estado aplicable.

Patrón incorrecto

usar geocercas por defecto

mezclar geofences y geocercas en la misma pantalla sin transición documentada

6. Evaluación espacial oficial
Objetivo

Determinar si una posición intersecta una geocerca.

Patrón correcto

Usar PostGIS en backend / DB con funciones espaciales canónicas.

Ejemplos típicos:

ST_Intersects
ST_Contains
ST_Within
Patrón incorrecto

calcular geofencing oficial en frontend

usar aproximaciones visuales para decisiones oficiales

descargar geocercas completas al cliente para decidir ENTER / EXIT

7. Dashboards y listados administrativos
Objetivo

Mostrar agregados, tablas y resumen operativo.

Patrón correcto

consultas paginadas

columnas explícitas

filtros por organización

vistas o RPC cuando el patrón se repite y conviene centralizar

Patrón incorrecto

joins masivos sin necesidad

traer historial completo para calcular resúmenes en frontend

consultas sin límite

Patrones de Filtro Recomendados
Por organización

Toda consulta de negocio debe estar alineada con el aislamiento por organización.

Incluso con RLS, el diseño de consultas debe asumir el límite lógico por org.

Por rango temporal

En tablas de tracking usar siempre rango temporal cuando sea posible.

Especialmente en:

positions

tracker_geofence_events

tracker_logs

Por entidad principal

Usar filtros directos por entidades como:

tracker_id

geofence_id

activity_id

assignment_id

Evitar consultas abiertas que luego se filtran en frontend.

Con paginación

Listados largos deben usar:

limit

offset o cursores

orden estable

No devolver grandes volúmenes por defecto.

Patrones de Selección de Columnas

Seleccionar solo lo necesario.

Correcto
SELECT id, name, org_id
FROM geofences
WHERE org_id = :org_id;
Incorrecto
SELECT *
FROM geofences;
Regla

Si una pantalla usa 4 campos, la query no debe traer 20.

Patrones de Joins
Regla general

Solo hacer joins cuando aportan valor directo a la consulta.

Evitar joins automáticos o encadenados sobre tablas grandes.

Joins permitidos

relaciones canónicas bien definidas en DB_SCHEMA_MAP.md

joins necesarios para contexto de negocio

joins paginados y filtrados

Joins peligrosos

joins entre tablas grandes sin filtros

joins históricos sobre positions sin rango temporal

joins legacy + canonical sin justificación

joins que multiplican filas y luego se arreglan en frontend

Patrones para Supabase
Preferir consultas acotadas

En llamadas Supabase seleccionar columnas explícitas y filtros claros.

Ejemplo conceptual:

const query = supabase
  .from('tracker_latest')
  .select('tracker_id, recorded_at, geom')
  .eq('org_id', orgId);
Evitar

.select('*') por costumbre

traer datos masivos para filtrar en cliente

múltiples consultas repetitivas cuando un patrón central puede resolverse mejor

Cuándo usar vistas o RPC

Usar vistas o RPC cuando:

la lógica de consulta se repite mucho

la consulta debe centralizar reglas

la consulta requiere lógica SQL más compleja

conviene estabilizar una interfaz de acceso a datos

No crear vistas o RPC inventadas sin revisar primero DB_SCHEMA_MAP.md.

Patrones por Tabla Crítica
positions

Usar para:

historial

análisis temporal

auditoría de trayectorias

evaluación de geofence dentro del pipeline

No usar para:

mapa principal en tiempo real

listados generales sin filtros

dashboards que necesitan solo estado actual

tracker_latest

Usar para:

mapa principal

estado actual

listados de trackers activos

paneles en tiempo real

No usar para:

reconstruir historial detallado

tracker_geofence_events

Usar para:

timeline de ENTER / EXIT

historial de eventos

alertas y reportes operativos

No usar para:

deducir geometría actual del tracker

reemplazar historial de posiciones

geofences

Usar para:

geocercas oficiales del modelo canónico

consultas espaciales

asignaciones y visualización

No usar geocercas por defecto si el flujo ya fue definido como canónico.

Anti-Patterns Prohibidos

Quedan prohibidos estos patrones:

SELECT * por costumbre

consultar positions para render principal del mapa

queries sin rango temporal en tablas masivas

filtros de seguridad solo en frontend

joins pesados sin necesidad

traer datos de más para procesar en React

inferir ENTER / EXIT desde cliente

mezclar legacy y canonical sin aclaración

ignorar RLS o suponer bypass

resolver performance con cachés improvisados antes de corregir la query base

Reglas para IA y Copilot

Antes de proponer una query, la IA debe responder mentalmente estas preguntas:

¿Cuál es la tabla correcta para este caso de uso?

¿Existe una tabla resumida mejor que el historial bruto?

¿La consulta respeta multi-tenant?

¿La consulta necesita rango temporal?

¿La consulta necesita paginación?

¿Estoy mezclando legacy y canonical?

¿Estoy trayendo más columnas de las necesarias?

¿La lógica debería vivir en una vista o RPC?

Formato esperado al proponer queries

Cuando la IA proponga una consulta debe indicar:

objetivo de la consulta

tabla correcta a usar

filtros obligatorios

impacto en rendimiento

impacto en RLS

por qué esa consulta es mejor que alternativas más pesadas

Regla Final

Las consultas del sistema deben priorizar siempre:

seguridad real

claridad

tabla correcta para cada caso

filtros mínimos necesarios

compatibilidad con RLS

rendimiento sostenible

Si hay duda sobre qué tabla consultar:

no improvisar.
Primero validar contra docs/DB_SCHEMA_MAP.md y la arquitectura documentada.