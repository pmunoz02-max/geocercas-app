TRACKING_PERFORMANCE_STRATEGY.md
# TRACKING_PERFORMANCE_STRATEGY

Este documento define la estrategia oficial de rendimiento y escalabilidad para el sistema de tracking GPS de **App Geocercas**.

El objetivo es permitir que el sistema escale a:

- miles de trackers activos
- millones de posiciones GPS
- consultas rápidas de mapas
- generación eficiente de eventos de geofence
- almacenamiento controlado de datos históricos

---

# Principio Fundamental

El volumen de datos GPS crece extremadamente rápido.

Ejemplo aproximado:

1 tracker enviando datos cada 10 segundos:

- 360 posiciones por hora
- 8640 posiciones por día
- 3.1 millones por año

Con 100 trackers:

- 310 millones de posiciones por año

Por lo tanto:

el diseño del sistema debe asumir **crecimiento masivo de datos**.

---

# Pipeline Oficial de Tracking

Definido en:

docs/TRACKING_SCALABILITY_DECISION.md

Pipeline:

tracker_assignments
        ↓
positions
        ↓
geofence evaluation
        ↓
tracker_geofence_events
        ↓
tracker_latest

---

# Rol de cada tabla en rendimiento

## positions

Tabla principal de ingestión.

Características:

- volumen extremadamente alto
- escritura constante
- consultas temporales frecuentes

Debe optimizarse para:

- inserciones rápidas
- consultas por tiempo
- consultas por tracker
- consultas espaciales

---

## tracker_latest

Tabla de estado actual del tracker.

Objetivo:

evitar consultas pesadas sobre `positions`.

Debe contener:

- última posición
- timestamp
- estado actual

Esto permite:

- mostrar trackers en mapa en tiempo real
- evitar scans grandes en `positions`.

---

## tracker_geofence_events

Tabla de eventos de geocercas.

Volumen moderado.

Debe optimizarse para:

- consultas por tracker
- consultas por geofence
- consultas por rango temporal.

---

# Estrategia de Índices

Las tablas de tracking deben tener índices adecuados.

## Índices recomendados para positions

### Índice por tracker y tiempo

```sql
CREATE INDEX idx_positions_tracker_time
ON positions (tracker_id, recorded_at DESC);

Permite:

obtener historial de tracker rápidamente

consultar últimas posiciones.

Índice temporal
CREATE INDEX idx_positions_time
ON positions (recorded_at DESC);

Permite:

consultas por rango de tiempo.

Índice espacial

Si se usa PostGIS:

CREATE INDEX idx_positions_geom
ON positions
USING GIST (geom);

Permite:

consultas espaciales

intersección con geofences.

Estrategia de Escritura

El sistema debe optimizarse para escrituras rápidas.

Buenas prácticas:

evitar triggers pesados en positions

evitar joins durante inserción

evitar lógica compleja en la ingestión

La evaluación de geofence debe ejecutarse de forma eficiente después de la inserción.

Estrategia de Lectura

Las consultas más comunes son:

última posición del tracker

historial reciente del tracker

trackers visibles en mapa

eventos de geofence

historial de actividad

Estas consultas deben evitar scans grandes en positions.

Para ello se usa:

tracker_latest

como tabla de estado resumido.

Estrategia de Retención de Datos

Definida en:

docs/TRACKING_DATA_RETENTION_POLICY.md

Etapas:

Hot
0-30 días

Warm
30-180 días

Archive
180+ días

Datos Hot

Guardados en:

positions

Consultados frecuentemente.

Datos Warm

Datos históricos menos consultados.

Opciones:

mover a tablas históricas

mantener índices reducidos.

Datos Archive

Datos antiguos pueden:

exportarse

comprimirse

almacenarse en almacenamiento frío.

Estrategia de Particionamiento

Cuando positions crezca significativamente se recomienda usar:

partitioning por tiempo.

Ejemplo conceptual:

positions_2026_01
positions_2026_02
positions_2026_03

Ventajas:

consultas más rápidas

mantenimiento más fácil

borrado de datos más simple.

Estrategia de Consultas para Mapas

Los mapas requieren mostrar:

trackers activos

última posición

Nunca consultar directamente:

positions

para renderizar el mapa principal.

Siempre usar:

tracker_latest

Esto evita consultas pesadas.

Estrategia para Historial de Tracker

Cuando se necesite historial:

consultar positions filtrando por:

tracker_id

rango temporal

Ejemplo conceptual:

últimas 24 horas
última semana.

Nunca devolver historiales masivos sin paginación.

Estrategia de Evaluación de Geofence

La evaluación espacial debe:

usar índices espaciales

evaluar solo geofences candidatas

evitar comparar contra todas las geocercas

Proceso:

position received
↓
candidate geofences
↓
spatial intersection
↓
state comparison
↓
event generation

Estrategia de Carga en Dashboard

Dashboards deben evitar:

queries masivas

joins innecesarios

scans de positions

Preferir:

vistas optimizadas

datos resumidos

queries paginadas.

Observabilidad de Performance

Se deben monitorear:

latencia de inserción en positions

tamaño de tabla positions

uso de índices

tiempo de consultas espaciales

tiempo de generación de eventos

tamaño de tracker_geofence_events

Señales de Problemas de Escalabilidad

Indicadores comunes:

consultas lentas en mapa

latencia en eventos ENTER / EXIT

crecimiento acelerado de positions

CPU alta en Postgres

scans completos de tabla

Si aparecen estos síntomas se debe:

revisar índices
revisar consultas
considerar particionamiento.

Reglas para IA y Copilot

IA assistants no deben:

consultar positions para mapas en tiempo real

eliminar índices críticos

introducir joins pesados en tracking

modificar pipeline de tracking sin análisis

generar consultas sin filtros de tiempo o tracker.

Objetivo Final

El sistema debe poder escalar a:

miles de trackers activos

cientos de millones de posiciones

consultas rápidas para mapas

generación eficiente de eventos de geofence

sin degradación significativa del sistema.