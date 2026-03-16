VENT_PROCESSING_ARCHITECTURE.md
# EVENT_PROCESSING_ARCHITECTURE

Este documento define la arquitectura de procesamiento de eventos en **App Geocercas**.

El sistema genera eventos operativos derivados principalmente del pipeline de tracking y del motor de geofencing.

El objetivo es garantizar que los eventos:

- se generen de forma consistente
- se almacenen de forma confiable
- puedan procesarse para alertas y automatizaciones
- puedan escalar a alto volumen
- no afecten el rendimiento del pipeline de tracking

---

# Principio Fundamental

El sistema distingue claramente entre:

1. datos de tracking
2. eventos derivados
3. acciones desencadenadas por eventos

Cada uno pertenece a una etapa distinta del sistema.

Esto evita mezclar lógica de procesamiento con persistencia de datos.

---

# Tipos de Eventos del Sistema

Los eventos principales generados por el sistema incluyen:

## Eventos de Geofence

- ENTER
- EXIT

Estos eventos se generan cuando un tracker cruza los límites de una geocerca.

Persistidos en:

tracker_geofence_events

---

## Eventos Operativos

Eventos relacionados con la operación del sistema.

Ejemplos:

- tracker asignado
- tracker desasignado
- geofence creada
- geofence eliminada

---

## Eventos de Sistema

Eventos internos utilizados para monitoreo o mantenimiento.

Ejemplos:

- tracker offline
- tracker sin señal
- ingestión fallida

---

# Pipeline de Generación de Eventos

El pipeline principal es:

position received
        ↓
persist in positions
        ↓
evaluate geofences
        ↓
detect state change
        ↓
generate event
        ↓
persist event
        ↓
trigger downstream processing

Este pipeline debe mantenerse simple y eficiente.

---

# Persistencia de Eventos

Los eventos derivados de geofencing se almacenan en:

tracker_geofence_events

Esta tabla debe contener al menos:

- event_id
- tracker_id
- geofence_id
- event_type (ENTER / EXIT)
- timestamp
- org_id

Esto permite consultas eficientes para:

- dashboards
- reportes
- auditoría

---

# Separación entre Generación y Consumo

La arquitectura distingue entre:

## Generación de eventos

Responsabilidad del pipeline de tracking y geofencing.

Debe ser:

- rápida
- consistente
- determinística

---

## Consumo de eventos

Responsabilidad de sistemas downstream.

Ejemplos:

- alertas
- notificaciones
- automatizaciones
- analytics

Esto evita sobrecargar el pipeline principal.

---

# Estrategia de Procesamiento de Eventos

Los eventos generados pueden activar procesos secundarios.

Ejemplos:

ENTER → enviar alerta  
EXIT → registrar actividad  
ENTER + duración → alerta avanzada

Para mantener escalabilidad, estas acciones deben ejecutarse fuera del pipeline crítico.

---

# Cola de Procesamiento (Conceptual)

Para sistemas de alto volumen se puede utilizar un modelo de cola.

Ejemplo conceptual:

event generated
        ↓
event queue
        ↓
event workers
        ↓
notifications / automation / analytics

Esto permite desacoplar generación y consumo.

---

# Alertas Basadas en Eventos

Las alertas se generan a partir de eventos persistidos.

Ejemplo:

ENTER geofence → alerta  
EXIT geofence → alerta

Las alertas pueden enviarse mediante:

- notificaciones push
- email
- webhooks
- dashboards

Las reglas de alerta deben ser configurables por organización.

---

# Automatizaciones

Los eventos también pueden activar automatizaciones.

Ejemplos:

- registrar actividad automática
- generar reportes
- activar workflows externos

Estas automatizaciones deben ser configurables y no afectar el pipeline principal.

---

# Observabilidad del Sistema de Eventos

Se deben monitorear métricas como:

- número de eventos generados por minuto
- latencia de generación de eventos
- latencia de procesamiento de alertas
- número de eventos por organización

Esto ayuda a detectar problemas de escalabilidad.

---

# Prevención de Eventos Duplicados

El sistema debe evitar generar eventos duplicados.

Esto se logra comparando el estado actual con el estado previo del tracker.

Ejemplo:

tracker estaba fuera de geofence  
nueva posición dentro → ENTER

Si ya estaba dentro → no generar evento.

---

# Estrategia para Alto Volumen

Si el volumen de eventos crece significativamente, el sistema puede adoptar:

- procesamiento en batch
- workers dedicados
- colas distribuidas
- servicios de eventos especializados

Esto permite escalar sin afectar el pipeline de tracking.

---

# Multi-Tenant y Eventos

Todos los eventos deben incluir:

org_id

Esto garantiza que:

- las consultas respeten aislamiento
- los dashboards muestren solo datos relevantes
- las alertas se envíen correctamente

---

# Patrones de Consulta de Eventos

Consultas típicas incluyen:

## Historial de eventos por tracker

Filtrar por:

- tracker_id
- rango temporal

---

## Eventos por geofence

Filtrar por:

- geofence_id
- rango temporal

---

## Eventos por organización

Filtrar por:

- org_id
- rango temporal

---

# Reglas para IA y Copilot

IA assistants no deben:

- generar eventos desde frontend
- inferir eventos recalculando historial GPS
- generar alertas dentro del pipeline crítico
- mezclar lógica de tracking con lógica de notificaciones

Los eventos deben generarse únicamente dentro del motor de geofencing o procesos oficiales del sistema.

---

# Anti-Patterns Prohibidos

Quedan prohibidos:

- generar eventos desde UI
- recalcular eventos en dashboards
- ejecutar lógica pesada dentro del pipeline de tracking
- duplicar lógica de eventos en múltiples servicios
- ignorar org_id en eventos

---

# Objetivo Final

El sistema de eventos debe permitir que **App Geocercas** escale a alto volumen de tracking y geofencing manteniendo:

- generación confiable de eventos
- procesamiento desacoplado
- soporte para alertas y automatizaciones
- rendimiento estable del sistema.