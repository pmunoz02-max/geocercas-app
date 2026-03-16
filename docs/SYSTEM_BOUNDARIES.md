SYSTEM_BOUNDARIES.md
# SYSTEM_BOUNDARIES

Este documento define los límites oficiales de responsabilidad entre las distintas capas del sistema **App Geocercas**.

Su objetivo es evitar:

- duplicación de lógica
- lógica de negocio en capas incorrectas
- violaciones de seguridad multi-tenant
- inconsistencias entre frontend, backend y base de datos
- errores generados por IA o Copilot al implementar cambios

Este documento debe ser usado como guía obligatoria antes de introducir nueva lógica en cualquier parte del sistema.

---

# Principio Fundamental

Cada capa del sistema tiene una responsabilidad específica.

La regla general es:

- el frontend presenta y coordina
- el backend orquesta
- la base de datos persiste y protege
- el motor de geofencing evalúa reglas espaciales
- la seguridad no depende del cliente

## Regla crítica

Nunca implementar la misma lógica crítica en más de una capa salvo que exista una razón explícita y documentada.

---

# Capas del Sistema

El sistema se divide conceptualmente en:

1. Frontend
2. Backend / Supabase layer
3. PostgreSQL / PostGIS
4. Motor de tracking
5. Motor de geofencing
6. Capa SaaS / límites y entitlements
7. Observabilidad y monitoreo

---

# 1. Frontend

Stack principal:

- React
- Vite
- Leaflet
- Tailwind

## Responsabilidades permitidas

El frontend sí puede encargarse de:

- renderizar interfaces
- mostrar mapas y geocercas
- capturar interacción del usuario
- enviar filtros, parámetros y formularios
- mostrar estados de trackers
- mostrar eventos de geocercas
- mostrar errores de forma amigable
- coordinar navegación y experiencia de usuario

## Responsabilidades NO permitidas

El frontend no debe encargarse de:

- seguridad de acceso real
- aislamiento multi-tenant
- validación final de permisos
- enforcement de límites SaaS
- lógica oficial de geofencing
- generación oficial de eventos ENTER / EXIT
- decisiones estructurales del pipeline de tracking
- asumir que puede ver datos de múltiples organizaciones

## Regla crítica

El frontend puede ocultar elementos por UX, pero **nunca** debe ser la única capa que aplica restricciones de seguridad.

---

# 2. Backend / Supabase Layer

Esta capa incluye:

- acceso a Supabase
- funciones server-side
- RPC
- endpoints
- lógica de orquestación

## Responsabilidades permitidas

Esta capa sí puede encargarse de:

- coordinar flujos de negocio
- invocar consultas seguras
- aplicar validaciones de negocio
- verificar límites antes de operaciones sensibles
- invocar RPC o funciones SQL
- centralizar reglas reutilizables
- preparar respuestas para el frontend
- integrar tracking con otras partes del sistema

## Responsabilidades NO permitidas

No debe:

- duplicar innecesariamente la lógica que ya vive bien en Postgres
- reemplazar RLS con filtros manuales inseguros
- asumir acceso global a datos
- saltarse org_id
- mover al frontend lógica que debe protegerse en servidor o DB

## Regla crítica

La capa backend debe respetar siempre el modelo multi-tenant y actuar como orquestador, no como bypass de seguridad.

---

# 3. PostgreSQL / PostGIS

La base de datos es responsable de:

- persistencia
- integridad de datos
- relaciones
- restricciones
- seguridad RLS
- operaciones espaciales
- consultas eficientes
- soporte al pipeline de tracking

## Responsabilidades permitidas

La base de datos sí debe encargarse de:

- constraints
- claves PK/FK
- índices
- RLS
- vistas
- RPC SQL
- operaciones espaciales con PostGIS
- joins canónicos
- estructura de datos oficial

## Responsabilidades NO permitidas

La base de datos no debe usarse para:

- lógica de UI
- reglas visuales
- hacks temporales de frontend
- parches específicos de pantalla
- lógica comercial confusa no documentada

## Regla crítica

La base de datos es la fuente de verdad estructural.  
No debe ser contradicha por el frontend ni por código generado automáticamente.

---

# 4. Motor de Tracking

Pipeline oficial documentado en:

- docs/TRACKING_SCALABILITY_DECISION.md

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

## Responsabilidades permitidas

El motor de tracking sí debe encargarse de:

- recibir posiciones
- persistir posiciones en `positions`
- activar la evaluación de geofences
- actualizar estado derivado del tracker
- mantener consistencia del flujo operativo

## Responsabilidades NO permitidas

No debe:

- mezclarse con reglas visuales del frontend
- incorporar lógica SaaS no relacionada
- escribir en tablas no canónicas sin razón documentada
- duplicar persistencia en modelos legacy sin necesidad
- generar lógica de permisos de usuario

## Regla crítica

El motor de tracking debe ser estable, simple y predecible.  
No debe convertirse en un punto de lógica de negocio general.

---

# 5. Motor de Geofencing

Documentado en:

- docs/GEOFENCE_ENGINE_ARCHITECTURE.md
- docs/GEOFENCE_EVENT_RULES.md

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

## Responsabilidades permitidas

El motor de geofencing sí debe encargarse de:

- evaluar intersección espacial
- determinar transición de estado
- generar eventos válidos ENTER / EXIT
- persistir eventos en `tracker_geofence_events`
- operar sobre estructuras canónicas de geofences

## Responsabilidades NO permitidas

No debe:

- contener lógica visual
- depender del frontend para generar eventos
- inventar reglas no documentadas
- mezclar heurísticas arbitrarias
- aplicar límites comerciales SaaS
- resolver permisos de usuarios

## Regla crítica

La lógica oficial de ENTER / EXIT vive en el motor de geofencing, no en el frontend ni en dashboards.

---

# 6. Capa SaaS / Entitlements

Documentado en:

- docs/SaaS_LIMITS_AND_ENTITLEMENTS.md

Tabla base esperada:

- org_billing

## Responsabilidades permitidas

La capa SaaS sí debe encargarse de:

- límites por organización
- features habilitadas
- enforcement de capacidad contratada
- restricciones por plan
- reglas de monetización
- compatibilidad con crecimiento comercial

## Responsabilidades NO permitidas

No debe:

- depender de ocultamiento visual únicamente
- quedar distribuida en múltiples componentes UI
- implementarse como ifs sueltos por toda la app
- romper el modelo multi-tenant

## Regla crítica

Los límites SaaS deben poder auditarse y aplicarse de manera centralizada.

---

# 7. Observabilidad y Monitoreo

Documentado en:

- docs/SYSTEM_OBSERVABILITY_AND_MONITORING.md

## Responsabilidades permitidas

La observabilidad sí debe cubrir:

- ingestión de posiciones
- latencia de procesamiento
- evaluación de geofences
- generación de eventos
- estado de trackers
- errores operativos
- consumo por organización
- uso de features SaaS

## Responsabilidades NO permitidas

No debe:

- depender solo de logs manuales
- quedarse solo en frontend
- ignorar pipeline de tracking
- ignorar impacto por organización

## Regla crítica

Todo cambio importante en tracking, geofencing, RLS o SaaS debe considerar observabilidad.

---

# Dónde debe vivir cada tipo de lógica

## Seguridad de acceso

Debe vivir en:

- RLS
- memberships
- backend seguro
- controles basados en org_id

No debe vivir solo en:

- frontend

---

## Aislamiento multi-tenant

Debe vivir en:

- schema
- org_id
- RLS
- consultas seguras

No debe vivir solo en:

- filtros de cliente
- estado de UI

---

## Geofencing oficial

Debe vivir en:

- motor de geofencing
- pipeline de tracking
- tablas canónicas

No debe vivir en:

- React components
- lógica de mapas en cliente
- cálculos improvisados en frontend

---

## Validaciones de formularios

Pueden vivir en:

- frontend, para UX
- backend, para validación real

No deben vivir solo en:

- frontend, si afectan integridad o seguridad

---

## Reglas de límites SaaS

Deben vivir en:

- backend
- capa central de entitlements
- lógica consistente con `org_billing`

No deben vivir solo en:

- botones deshabilitados del frontend

---

## Render de mapas y visualización

Debe vivir en:

- frontend

No debe vivir en:

- SQL
- lógica de tracking
- motor de geofencing

---

## Operaciones espaciales oficiales

Deben vivir en:

- PostGIS
- motor de geofencing
- consultas canónicas

No deben vivir en:

- cálculos improvisados del navegador para decisiones oficiales

---

# Reglas para IA y Copilot

Antes de agregar lógica nueva, la IA debe decidir primero:

1. qué capa es responsable
2. si ya existe esa lógica en otra capa
3. si la propuesta rompe límites del sistema
4. si la lógica afecta seguridad, RLS o multi-tenancy
5. si la lógica debería centralizarse en vez de duplicarse

## Regla crítica

Si una lógica afecta:

- seguridad
- org_id
- geofencing oficial
- tracking pipeline
- límites SaaS
- integridad de datos

entonces no debe resolverse solo en frontend.

---

# Anti-Patterns Prohibidos

Quedan prohibidos estos patrones:

- aplicar seguridad solo en React
- usar frontend como filtro principal de organización
- calcular eventos ENTER / EXIT en cliente
- duplicar reglas SaaS en múltiples pantallas
- reimplementar lógica espacial fuera del motor oficial
- crear queries que ignoren RLS
- resolver inconsistencias estructurales con parches visuales
- mezclar lógica legacy y canonical sin declaración explícita

---

# Reglas para cambios de código

Cuando se propongan cambios, indicar siempre:

1. capa afectada
2. razón por la que esa capa es la correcta
3. riesgo si se implementa en otra capa
4. impacto en arquitectura
5. impacto en seguridad
6. impacto en performance
7. paso mínimo seguro de implementación

---

# Regla Final

La arquitectura del sistema debe mantenerse con límites claros.

La IA y Copilot deben priorizar siempre:

- una sola fuente de verdad por responsabilidad
- seguridad real por encima de conveniencia
- lógica centralizada por encima de duplicación
- consistencia arquitectónica por encima de velocidad

Si existe duda sobre dónde debe vivir una lógica:

**no improvisar.**
Primero validar contra la arquitectura documentada.