MONETIZATION_ARCHITECTURE.md

# MONETIZATION_ARCHITECTURE

Este documento define la arquitectura de monetización del sistema **App Geocercas**.

## Entornos y Proveedores

- **Producción:** Stripe legacy (no migrado)
- **Preview:** Paddle (migrado, Stripe deshabilitado)

El objetivo es permitir que la plataforma funcione como **SaaS comercial escalable**, soportando:

- múltiples organizaciones
- diferentes planes
- límites por plan
- features premium
- crecimiento progresivo del cliente
- compatibilidad con Google Play y distribución web

---

# Principio Fundamental

La monetización debe integrarse en la arquitectura del sistema.

Los límites comerciales deben implementarse como **entitlements verificables**, no como simples restricciones visuales.

Esto permite:

- aplicar límites de forma consistente
- evitar bypass desde frontend
- auditar uso por organización
- escalar el sistema comercialmente

---

# Unidad Comercial Principal

La unidad principal de monetización es:


organization


Cada organización representa un cliente SaaS.

Las organizaciones pueden tener:

- múltiples usuarios
- múltiples trackers
- múltiples geocercas
- múltiples actividades

---


# Tabla de Facturación

La tabla base para monetización es:

org_billing

Incluye soporte para Stripe (producción) y Paddle (preview):

- plan activo
- límites aplicables
- estado de suscripción
- fechas de renovación
- flags de features habilitadas
- billing_provider (stripe|paddle)
- paddle_customer_id, paddle_subscription_id, paddle_price_id, last_paddle_event_at (solo preview)

Ver detalles en [PADDLE_PREVIEW_MIGRATION.md](./PADDLE_PREVIEW_MIGRATION.md)

---

# Tipos de Planes

La arquitectura debe permitir múltiples niveles de servicio.

Ejemplo conceptual:

Free  
Starter  
Professional  
Enterprise

Cada plan puede definir límites diferentes.

---

# Límites Técnicos por Plan

Los planes pueden restringir recursos del sistema.

Ejemplos:

## Trackers

Número máximo de trackers activos.

Ejemplo conceptual:

Free → 3  
Starter → 20  
Professional → 100  
Enterprise → ilimitado

---

## Geocercas

Número máximo de geocercas.

Esto afecta:

- complejidad del motor espacial
- carga de evaluación de geofence

---

## Frecuencia de Tracking

Intervalo mínimo entre posiciones.

Ejemplo:

Free → 60 segundos  
Starter → 30 segundos  
Professional → 10 segundos

Esto controla el volumen de `positions`.

---

## Retención de Datos

Duración del historial disponible.

Ejemplo:

Free → 7 días  
Starter → 30 días  
Professional → 180 días  
Enterprise → configurable

Relacionado con:

- docs/TRACKING_DATA_RETENTION_POLICY.md

---

## Usuarios Administradores

Número máximo de usuarios con permisos administrativos.

Esto evita abuso en cuentas gratuitas.

---

## Alertas y Automatizaciones

Features premium como:

- alertas en tiempo real
- notificaciones
- integraciones externas
- reglas avanzadas

---

# Entitlements del Sistema

Cada organización tiene un conjunto de **entitlements activos**.

Estos entitlements pueden incluir:

- max_trackers
- max_geofences
- tracking_frequency_limit
- retention_days
- alerts_enabled
- analytics_enabled
- integrations_enabled

Los entitlements deben consultarse desde backend o DB.

Nunca deben depender únicamente del frontend.

---

# Aplicación de Límites

Los límites deben aplicarse en puntos críticos del sistema.

## Creación de Trackers

Antes de crear un tracker:

verificar que la organización no haya superado su límite.

---

## Creación de Geocercas

Antes de crear una geocerca:

verificar límite de geofences por plan.

---

## Tracking Frequency

El backend debe validar que la frecuencia de ingestión de posiciones respete el plan.

Esto protege la infraestructura.

---

## Acceso a Historial

Las consultas a `positions` deben limitarse según la retención del plan.

Ejemplo conceptual:

Free plan:

solo últimos 7 días.

---

# Features Premium

Algunas funcionalidades pueden activarse solo en planes superiores.

Ejemplos:

- analytics avanzados
- reportes exportables
- integraciones externas
- alertas inteligentes
- dashboards personalizados

La activación debe basarse en entitlements.

---

# Arquitectura de Verificación

Las verificaciones de plan deben ejecutarse en:

- backend
- funciones RPC
- validaciones previas a operaciones críticas

Nunca confiar solo en:

- lógica de frontend
- ocultamiento de botones

---

# Observabilidad Comercial

El sistema debe poder medir uso por organización.

Ejemplos:

- número de trackers activos
- número de geocercas
- volumen de posiciones
- número de eventos generados
- consultas a historial

Esto permite:

- detectar abuso
- optimizar pricing
- diseñar nuevos planes

---

# Compatibilidad con Google Play

Si la aplicación móvil usa suscripciones Google Play:

la suscripción debe vincularse con:


organization


Esto permite:

- sincronizar plan móvil con backend
- mantener consistencia entre plataformas

---

# Compatibilidad Web SaaS

Para usuarios web se pueden usar:

- Stripe
- facturación directa
- cuentas empresariales

La arquitectura debe permitir múltiples proveedores de pago.

---

# Estrategia de Crecimiento

El modelo SaaS debe facilitar la progresión de planes.

Flujo típico:

Free  
↓  
Starter  
↓  
Professional  
↓  
Enterprise

El objetivo es que el cliente escale su plan conforme crece su operación.

---

# Reglas para IA y Copilot

IA assistants no deben:

- implementar límites solo en frontend
- crear lógica SaaS distribuida en múltiples componentes
- duplicar reglas de plan en distintos lugares
- hardcodear límites en código

Los límites deben centralizarse en:


org_billing


y evaluarse mediante lógica consistente.

---

# Relación con Arquitectura del Sistema

La monetización interactúa con:

- tracking pipeline
- motor de geofencing
- retención de datos
- seguridad multi-tenant
- observabilidad del sistema

Por lo tanto cualquier cambio en pricing debe considerar impacto técnico.

---

# Objetivo Final

La arquitectura de monetización debe permitir que **App Geocercas** funcione como una plataforma SaaS rentable, escalable y técnicamente consistente.

La monetización no debe ser un parche, sino una extensión natural de la arquitectura existen