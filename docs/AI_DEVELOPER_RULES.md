AI_DEVELOPER_RULES.md
# AI_DEVELOPER_RULES

Este documento define las reglas obligatorias que deben seguir **IA assistants y Copilot** al generar código dentro del repositorio de **App Geocercas**.

El objetivo es:

- proteger la arquitectura del sistema
- evitar cambios peligrosos en la base de datos
- mantener consistencia en el modelo multi-tenant
- prevenir errores comunes de generación automática de código

Estas reglas aplican a:

- ChatGPT
- GitHub Copilot
- Cursor AI
- Claude
- cualquier IA usada para desarrollo en este repositorio.

---

# Principio Fundamental

La IA **no debe asumir la arquitectura**.

Debe **respetar la arquitectura existente**.

Si hay dudas sobre el modelo de datos, se debe consultar primero:


docs/DB_SCHEMA_MAP.md


---

# Fuente de Verdad del Modelo de Datos

La estructura oficial del sistema está definida en:


docs/DB_SCHEMA_MAP.md


Este documento define:

- tablas
- columnas
- relaciones
- vistas
- RPC SQL
- coexistencia legacy / canonical
- notas de seguridad RLS

## Regla crítica

Nunca generar código que:

- invente tablas
- invente columnas
- invente relaciones
- invente vistas
- invente RPC SQL

Si el schema no está claro:

**solicitar primero la definición real de la tabla.**

---

# Arquitectura Multi-Tenant

El sistema es **multi-tenant por organización**.

Toda entidad del sistema debe estar aislada por:


org_id


El acceso está controlado por:


memberships


La seguridad se implementa mediante:


Row Level Security (RLS)


Principio fundamental:


row.org_id ∈ user's memberships


## Reglas obligatorias

La IA **no debe generar código que:**

- ignore org_id
- haga queries cross-organization
- use accesos globales a tablas
- desactive RLS
- haga bypass de seguridad

---

# Pipeline Oficial de Tracking

Definido en:


docs/TRACKING_SCALABILITY_DECISION.md


Pipeline oficial:


tracker_assignments
↓
positions
↓
geofence evaluation
↓
tracker_geofence_events
↓
tracker_latest


## Roles

positions  
→ ingesta de posiciones GPS

tracker_geofence_events  
→ eventos ENTER / EXIT

tracker_latest  
→ estado actual del tracker

## Regla crítica

La IA **no debe alterar este pipeline** sin una justificación arquitectónica clara.

---

# Motor de Geofencing

Documentado en:


docs/GEOFENCE_ENGINE_ARCHITECTURE.md
docs/GEOFENCE_EVENT_RULES.md


Proceso conceptual:


position received
↓
candidate geofences
↓
spatial intersection test
↓
previous state comparison
↓
event generation


Eventos permitidos:


ENTER
EXIT


Persistencia oficial:


tracker_geofence_events


## Regla crítica

La IA **no debe inventar nuevas reglas de geofencing** como:

- dwell time
- debounce
- estados intermedios
- heurísticas espaciales

sin documentación explícita.

---

# Legacy vs Canonical

El sistema tiene coexistencia temporal entre modelos:

Canonical:


geofences
positions
tracker_geofence_events


Legacy:


geocercas
tracker_positions


## Regla crítica

La IA **no debe mezclar modelos legacy y canonical** sin aclarar el contexto.

---

# Reglas para SQL

Antes de generar SQL la IA debe:

1. confirmar la estructura real de la tabla
2. revisar `DB_SCHEMA_MAP.md`
3. verificar impacto en RLS
4. verificar impacto en el pipeline
5. verificar impacto en datos existentes

## SQL que requiere validación previa

Nunca generar automáticamente:

- ALTER TABLE
- DROP COLUMN
- DROP TABLE
- cambio de tipo de columna
- cambio de claves primarias
- cambio de claves foráneas
- modificación de políticas RLS

---

# Reglas para Queries

Las consultas deben:

- respetar org_id
- funcionar con RLS activo
- evitar joins innecesarios
- evitar SELECT *

Ejemplo correcto:


SELECT *
FROM positions
WHERE org_id = current_setting('app.current_org_id')::uuid


La lógica de aislamiento **nunca debe depender solo del frontend**.

---

# Reglas para Backend

Al generar código backend:

La IA debe:

- respetar RLS
- evitar lógica duplicada
- evitar lógica de negocio en frontend
- mantener consistencia de naming
- respetar el pipeline de tracking

---

# Reglas para Frontend

El frontend **no es responsable de la seguridad**.

La IA no debe:

- confiar en validaciones solo del cliente
- implementar filtros de seguridad solo en frontend
- asumir que los datos recibidos son globales

---

# Reglas para Cambios de Código

Cuando la IA proponga cambios debe indicar:

1️⃣ archivo a modificar  
2️⃣ bloque actual  
3️⃣ bloque nuevo  
4️⃣ objetivo del cambio  
5️⃣ comportamiento que no debe romper

---

# Estrategia de Cambios

Los cambios deben ser:

- pequeños
- reversibles
- probables de testear
- compatibles con el sistema actual

Evitar cambios masivos en una sola iteración.

---

# Reglas de Deploy

El proyecto sigue esta política:

Branch de desarrollo:


preview


Nunca:

- hacer push directo a `main`
- mezclar preview con producción

Producción se actualiza solo mediante:


Promote to Production


desde deployments preview.

---

# Observabilidad

Cualquier cambio importante debe considerar impacto en:

- ingestión de posiciones
- evaluación de geocercas
- generación de eventos
- estado de trackers
- consumo SaaS por organización

Documentado en:


docs/SYSTEM_OBSERVABILITY_AND_MONITORING.md


---

# Objetivos del Proyecto

La IA debe ayudar principalmente en:

- optimización del pipeline de tracking
- mejoras del motor de geofencing
- seguridad multi-tenant
- escalabilidad SaaS
- monetización del sistema
- observabilidad del sistema
- soporte para implementación con Copilot

---

# Regla Final

Si alguna parte de la arquitectura no está clara:

**no inventarla.**

Primero solicitar:

- estructura real del schema
- definición de la tabla
- documentación del sistema

La IA debe priorizar siempre:

**consistencia arquitectónica sobre velocidad de implementación.**
Por qué este documento es tan útil

Esto reduce muchísimo los errores de Copilot.

Copilot normalmente tiende a:

Problema	Este archivo lo evita
inventa columnas	✔
rompe multi-tenant	✔
mezcla legacy	✔
queries incorrectas	✔
rompe pipeline	✔
Cómo se usa realmente este archivo

Se coloca en el repo:

/docs/AI_DEVELOPER_RULES.md

Y luego se referencia desde:

README.md

o

CONTRIBUTING.md