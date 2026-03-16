PRODUCT_FEATURE_MATRIX.md
# PRODUCT_FEATURE_MATRIX

Este documento define la matriz oficial de funcionalidades de **App Geocercas**.

El objetivo es:

- establecer qué funcionalidades existen en la plataforma
- definir qué features pertenecen a cada plan
- alinear arquitectura técnica con monetización
- facilitar decisiones de producto y pricing
- servir como referencia para desarrollo futuro

Este documento complementa:

- docs/MONETIZATION_ARCHITECTURE.md
- docs/SaaS_LIMITS_AND_ENTITLEMENTS.md

---

# Principio Fundamental

Las funcionalidades del sistema se organizan en **niveles de acceso por plan**.

Los planes representan diferentes niveles de capacidad y funcionalidad dentro de la plataforma SaaS.

Las features deben ser activadas mediante **entitlements asociados a la organización**.

Nunca deben depender únicamente de:

- lógica de frontend
- ocultamiento de botones
- flags dispersos en código

---

# Planes del Sistema

Ejemplo conceptual de planes disponibles:

Free  
Starter  
Professional  
Enterprise

Cada plan habilita diferentes capacidades.

---

# Categorías de Funcionalidades

Las funcionalidades del sistema se agrupan en categorías:

1. Gestión de Trackers
2. Geocercas
3. Tracking GPS
4. Eventos y Alertas
5. Visualización y Mapas
6. Reportes y Analytics
7. Integraciones
8. Administración de Organización
9. Retención de Datos

---

# 1. Gestión de Trackers

| Feature | Free | Starter | Professional | Enterprise |
|--------|------|--------|-------------|-----------|
| Registrar trackers | ✔ | ✔ | ✔ | ✔ |
| Límite de trackers | 3 | 20 | 100 | configurable |
| Estado actual en mapa | ✔ | ✔ | ✔ | ✔ |
| Historial de tracker | limitado | ✔ | ✔ | ✔ |
| Asignación a personal | ✖ | ✔ | ✔ | ✔ |

---

# 2. Geocercas

| Feature | Free | Starter | Professional | Enterprise |
|--------|------|--------|-------------|-----------|
| Crear geocercas | ✔ | ✔ | ✔ | ✔ |
| Límite de geocercas | 5 | 50 | 200 | configurable |
| Geocercas poligonales | ✔ | ✔ | ✔ | ✔ |
| Edición de geocercas | ✔ | ✔ | ✔ | ✔ |
| Geocercas compartidas | ✖ | ✖ | ✔ | ✔ |

---

# 3. Tracking GPS

| Feature | Free | Starter | Professional | Enterprise |
|--------|------|--------|-------------|-----------|
| Posición en tiempo real | ✔ | ✔ | ✔ | ✔ |
| Frecuencia mínima de tracking | 60s | 30s | 10s | configurable |
| Historial de trayectorias | limitado | ✔ | ✔ | ✔ |
| Seguimiento en mapa | ✔ | ✔ | ✔ | ✔ |

---

# 4. Eventos y Alertas

| Feature | Free | Starter | Professional | Enterprise |
|--------|------|--------|-------------|-----------|
| Eventos ENTER / EXIT | ✔ | ✔ | ✔ | ✔ |
| Historial de eventos | limitado | ✔ | ✔ | ✔ |
| Alertas en tiempo real | ✖ | ✔ | ✔ | ✔ |
| Notificaciones automáticas | ✖ | ✖ | ✔ | ✔ |
| Reglas avanzadas de alerta | ✖ | ✖ | ✔ | ✔ |

---

# 5. Visualización y Mapas

| Feature | Free | Starter | Professional | Enterprise |
|--------|------|--------|-------------|-----------|
| Mapa de trackers | ✔ | ✔ | ✔ | ✔ |
| Visualización de geocercas | ✔ | ✔ | ✔ | ✔ |
| Historial visual de trayectorias | limitado | ✔ | ✔ | ✔ |
| Mapas personalizados | ✖ | ✖ | ✔ | ✔ |

---

# 6. Reportes y Analytics

| Feature | Free | Starter | Professional | Enterprise |
|--------|------|--------|-------------|-----------|
| Reportes básicos | ✔ | ✔ | ✔ | ✔ |
| Exportación de reportes | ✖ | ✔ | ✔ | ✔ |
| Analytics avanzados | ✖ | ✖ | ✔ | ✔ |
| Dashboards personalizados | ✖ | ✖ | ✔ | ✔ |

---

# 7. Integraciones

| Feature | Free | Starter | Professional | Enterprise |
|--------|------|--------|-------------|-----------|
| API básica | ✖ | ✔ | ✔ | ✔ |
| Webhooks | ✖ | ✖ | ✔ | ✔ |
| Integraciones externas | ✖ | ✖ | ✔ | ✔ |
| Integraciones empresariales | ✖ | ✖ | ✖ | ✔ |

---

# 8. Administración de Organización

| Feature | Free | Starter | Professional | Enterprise |
|--------|------|--------|-------------|-----------|
| Gestión de usuarios | ✔ | ✔ | ✔ | ✔ |
| Límite de administradores | 1 | 3 | 10 | configurable |
| Roles personalizados | ✖ | ✖ | ✔ | ✔ |
| Auditoría de actividad | ✖ | ✖ | ✔ | ✔ |

---

# 9. Retención de Datos

| Feature | Free | Starter | Professional | Enterprise |
|--------|------|--------|-------------|-----------|
| Retención de posiciones | 7 días | 30 días | 180 días | configurable |
| Historial de eventos | 7 días | 30 días | 180 días | configurable |
| Exportación histórica | ✖ | ✖ | ✔ | ✔ |

---

# Relación con Arquitectura Técnica

Cada feature debe mapearse a:

- entitlements
- límites por organización
- validaciones backend
- restricciones en consultas

Ejemplo:

Feature: Historial de tracking  
Tabla involucrada: positions  
Restricción: retention_days

---

# Implementación Técnica de Features

Las features deben habilitarse mediante:

entitlements asociados a la organización.

Ejemplo conceptual:


org_billing.features.analytics_enabled


El backend debe validar estos entitlements antes de ejecutar operaciones premium.

---

# Estrategia de Upsell

La matriz de funcionalidades debe facilitar el crecimiento del cliente.

Flujo esperado:

Free  
↓  
Starter  
↓  
Professional  
↓  
Enterprise

Las features premium deben:

- aportar valor claro
- incentivar upgrade
- mantener diferenciación entre planes

---

# Reglas para IA y Copilot

IA assistants no deben:

- hardcodear features por plan
- distribuir lógica de monetización en múltiples componentes
- habilitar features premium sin verificar entitlements
- implementar límites solo en frontend

La verificación real debe vivir en backend o DB.

---

# Evolución del Producto

La matriz debe actualizarse cuando:

- se agreguen nuevas funcionalidades
- se modifique el pricing
- se introduzcan nuevos planes
- se agreguen features premium

Este documento sirve como referencia para priorización de desarrollo.

---

# Objetivo Final

La matriz de funcionalidades debe permitir que **App Geocercas** evolucione como un producto SaaS completo, alineando:

- desarrollo técnico
- estrategia de producto
- monetización
- crecimiento del cliente