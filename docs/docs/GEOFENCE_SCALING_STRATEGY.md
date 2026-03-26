GEOFENCE_SCALING_STRATEGY.md
# GEOFENCE_SCALING_STRATEGY

Este documento define la estrategia de escalabilidad del motor de geofencing en **App Geocercas**.

El objetivo es permitir que el sistema evalúe geocercas de forma eficiente incluso cuando existan:

- miles de geofences
- miles de trackers activos
- alto volumen de posiciones GPS

El diseño debe evitar comparaciones innecesarias y aprovechar las capacidades espaciales de **PostGIS**.

---

# Principio Fundamental

La evaluación de geocercas debe minimizar el número de comparaciones espaciales.

Nunca se debe evaluar:


cada posición
contra
todas las geocercas


El proceso debe reducir primero el conjunto de geocercas candidatas.

---

# Pipeline de Evaluación de Geofence

El pipeline conceptual es:

position received
        ↓
candidate geofences
        ↓
spatial intersection test
        ↓
previous state comparison
        ↓
event generation

Este proceso está documentado en:

- docs/GEOFENCE_ENGINE_ARCHITECTURE.md
- docs/GEOFENCE_EVENT_RULES.md

---

# Paso 1 — Filtrado de Geocercas Candidatas

Antes de ejecutar intersecciones espaciales completas, se deben seleccionar solo las geocercas cercanas a la posición.

Esto se logra mediante:

- índices espaciales
- bounding boxes
- consultas espaciales preliminares

Ejemplo conceptual:


SELECT geofence_id
FROM geofences
WHERE ST_Intersects(geom, ST_Buffer(position_point, candidate_radius))


Esto reduce el número de geocercas evaluadas.

---

# Índices Espaciales

Las geocercas deben tener un índice espacial.

Ejemplo:

```sql
CREATE INDEX idx_geofences_geom
ON geofences
USING GIST (geom);

Este índice permite:

búsquedas espaciales rápidas

filtrado eficiente de candidatos

Uso de Bounding Boxes

Las geometrías espaciales tienen un bounding box implícito.

PostGIS utiliza estas cajas para acelerar consultas espaciales.

Cuando se usa:

ST_Intersects

PostGIS primero compara bounding boxes antes de evaluar la geometría completa.

Esto reduce el costo de cálculo.

Reducción de Comparaciones

El proceso debe seguir este orden:

filtro espacial rápido

intersección geométrica

comparación de estado previo

Nunca ejecutar intersecciones geométricas contra todas las geocercas.

Estado Anterior del Tracker

Para determinar eventos ENTER / EXIT es necesario conocer el estado previo.

Esto puede obtenerse de:

tracker_latest

o

tracker_geofence_events

Esto evita generar eventos duplicados.

Evaluación de Eventos

Los únicos eventos oficiales son:

ENTER
EXIT

Persistidos en:

tracker_geofence_events

La lógica debe evitar:

duplicación de eventos

eventos inconsistentes

estados intermedios incorrectos

Estrategia de Evaluación Incremental

Cada nueva posición solo debe evaluarse contra:

geocercas cercanas

geocercas previamente activas para el tracker

Esto reduce aún más el número de evaluaciones.

Estrategia de Caché de Geocercas

Cuando existan muchas geocercas se puede usar:

caché de geocercas activas por organización

caché de bounding boxes

precálculo de áreas geográficas

Esto evita consultar la tabla completa constantemente.

Estrategia por Organización

Dado que el sistema es multi-tenant, las geocercas deben evaluarse primero por:

org_id

Ejemplo conceptual:

SELECT *
FROM geofences
WHERE org_id = current_org

Esto evita comparar geocercas de otras organizaciones.

Optimización para Geocercas Complejas

Algunas geocercas pueden tener:

muchos vértices

polígonos complejos

Para estos casos se recomienda:

simplificar geometrías

limitar número de vértices

usar tolerancias espaciales

Esto mejora el rendimiento de PostGIS.

Consultas Espaciales Recomendadas

PostGIS ofrece funciones optimizadas.

Ejemplo para verificar si una posición está dentro de una geocerca:

ST_Contains(geofence.geom, position.geom)

Alternativas según caso:

ST_Within
ST_Intersects

La elección depende del tipo de geometría.

Evitar Evaluación en Frontend

Las evaluaciones oficiales de geofence no deben ejecutarse en el frontend.

Motivos:

inconsistencias

falta de precisión

problemas de sincronización

seguridad

La lógica oficial debe vivir en el motor de geofencing.

Estrategia para Alto Volumen de Trackers

Cuando existan muchos trackers activos:

se debe evitar evaluar múltiples posiciones simultáneamente contra las mismas geocercas.

Opciones:

cola de procesamiento

procesamiento por batches

workers dedicados

Esto evita sobrecarga del sistema.

Estrategia de Observabilidad

Se deben monitorear métricas como:

tiempo promedio de evaluación de geofence

número de geocercas evaluadas por posición

latencia de generación de eventos

volumen de eventos ENTER / EXIT

Esto permite detectar problemas de escalabilidad.

Señales de Problemas de Escalabilidad

Indicadores comunes:

retraso en generación de eventos

consultas espaciales lentas

CPU alta en PostGIS

evaluación de demasiadas geocercas por posición

Si ocurre esto se debe:

revisar índices espaciales

revisar filtros de candidatos

simplificar geometrías

Reglas para IA y Copilot

IA assistants no deben:

evaluar geocercas en frontend

comparar posiciones contra todas las geocercas

ignorar org_id en consultas

eliminar índices espaciales

generar consultas espaciales sin usar PostGIS correctamente

Objetivo Final

El sistema debe poder escalar a:

miles de geocercas

miles de trackers

alto volumen de posiciones

manteniendo evaluaciones espaciales eficientes y generación rápida de eventos ENTER / EXIT