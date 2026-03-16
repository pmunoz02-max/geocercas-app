REALTIME_ARCHITECTURE.md
# REALTIME_ARCHITECTURE

Este documento define la arquitectura de actualización en tiempo real de **App Geocercas**.

El objetivo es permitir que los clientes visualicen:

- trackers moviéndose en el mapa
- eventos de geofence
- cambios operativos
- estado actual de dispositivos

sin necesidad de recargar constantemente la aplicación.

La arquitectura debe ser:

- eficiente
- escalable
- compatible con el pipeline de tracking
- segura en un entorno multi-tenant

---

# Principio Fundamental

El sistema distingue entre:

1. ingestión de datos (tracking pipeline)
2. persistencia de datos
3. distribución de actualizaciones en tiempo real

El sistema realtime **no debe interferir con el pipeline de tracking**.

Su función es **distribuir cambios ya persistidos**, no procesarlos.

---

# Flujo General de Datos en Tiempo Real

El flujo conceptual es:

tracker device
        ↓
tracking ingestion
        ↓
positions table
        ↓
tracker_latest update
        ↓
event generation
        ↓
realtime broadcast
        ↓
frontend update

Este modelo asegura que los datos enviados al cliente ya están confirmados en la base de datos.

---

# Fuente de Datos para Realtime

El sistema realtime debe emitir eventos basados en:

tracker_latest  
tracker_geofence_events

No debe emitir directamente desde:

positions

Esto evita transmitir grandes volúmenes de datos innecesarios.

---

# Actualizaciones de Trackers en Mapa

El mapa principal de la aplicación debe actualizarse utilizando datos de:

tracker_latest

Cada vez que se actualiza esta tabla, el sistema realtime puede emitir un evento.

Ejemplo conceptual:

tracker_latest updated
        ↓
broadcast update
        ↓
clients subscribed receive update

Esto permite mover los trackers en el mapa sin consultas constantes.

---

# Eventos de Geofence en Tiempo Real

Cuando ocurre un evento:

ENTER  
EXIT

y se registra en:

tracker_geofence_events

el sistema realtime puede emitir un evento para:

- mostrar alerta
- actualizar dashboards
- registrar actividad visual

---

# Suscripción por Organización

Debido al modelo multi-tenant, los clientes deben suscribirse únicamente a eventos de su organización.

Ejemplo conceptual:

subscription channel → org_id

Esto evita que los clientes reciban datos de otras organizaciones.

---

# Seguridad en Realtime

La seguridad debe respetar el mismo modelo multi-tenant del resto del sistema.

Las suscripciones realtime deben garantizar:

- aislamiento por org_id
- control por membresía
- acceso limitado a datos relevantes

Nunca emitir eventos globales a todos los clientes.

---

# Tipos de Eventos Realtime

## Actualización de Tracker

Emitido cuando cambia:

- posición
- timestamp
- estado

Fuente:

tracker_latest

---

## Evento de Geofence

Emitido cuando ocurre:

ENTER  
EXIT

Fuente:

tracker_geofence_events

---

## Cambios Operativos

Eventos secundarios pueden incluir:

- creación de geocerca
- asignación de tracker
- cambio de estado operativo

Estos eventos ayudan a sincronizar interfaces.

---

# Estrategia de Reducción de Tráfico

El sistema realtime debe evitar enviar información redundante.

Buenas prácticas:

- enviar solo cambios relevantes
- no transmitir historial completo
- limitar frecuencia de actualización
- evitar emisiones masivas innecesarias

---

# Estrategia de Sincronización Inicial

Cuando un cliente se conecta:

1. solicitar estado actual del sistema
2. obtener trackers desde `tracker_latest`
3. iniciar suscripción realtime
4. aplicar actualizaciones incrementales

Esto evita inconsistencias iniciales.

---

# Manejo de Desconexiones

Los clientes pueden perder conexión.

El sistema debe permitir:

- reconexión automática
- sincronización de estado actual
- reanudación de suscripciones

Esto garantiza continuidad visual.

---

# Estrategia de Escalabilidad

Si el número de clientes conectados crece significativamente, se deben considerar:

- canales por organización
- filtrado de eventos
- compresión de mensajes
- balanceo de conexiones

Esto permite soportar muchos clientes simultáneos.

---

# Observabilidad del Sistema Realtime

Se deben monitorear métricas como:

- número de clientes conectados
- eventos emitidos por segundo
- latencia de transmisión
- errores de suscripción
- reconexiones de clientes

Esto ayuda a detectar problemas de escalabilidad.

---

# Reglas para IA y Copilot

IA assistants no deben:

- enviar datos realtime directamente desde frontend
- transmitir datos desde tablas incorrectas
- emitir eventos sin considerar org_id
- enviar historial completo por canales realtime
- duplicar eventos ya persistidos

El sistema realtime debe basarse en cambios en tablas oficiales.

---

# Anti-Patterns Prohibidos

Quedan prohibidos estos patrones:

- usar polling constante en lugar de realtime
- emitir eventos desde frontend
- transmitir datos desde `positions`
- enviar eventos sin aislamiento por organización
- recalcular estado de trackers en cliente

---

# Objetivo Final

La arquitectura realtime debe permitir que **App Geocercas** proporcione una experiencia fluida de monitoreo en vivo, manteniendo:

- consistencia con la base de datos
- seguridad multi-tenant
- eficiencia de red
- escalabilidad para muchos trackers y clientes conectados.
Con este documento ya cerraste prácticamente toda la arquitectura

Ahora tu sistema tiene documentación para:

Arquitectura del sistema

pipeline de tracking

motor de geofencing

sistema de eventos

realtime

Escalabilidad

tracking performance

geofence scaling

procesamiento de eventos

Seguridad SaaS

aislamiento por organización

RLS

Desarrollo

reglas para IA

protocolo de cambios

patrones de queries

Producto

monetización

feature matrix