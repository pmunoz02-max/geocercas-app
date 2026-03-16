ORGANIZATION_DATA_ISOLATION.md
# ORGANIZATION_DATA_ISOLATION

Este documento define la estrategia oficial de aislamiento de datos por organización en **App Geocercas**.

El objetivo es garantizar que el sistema funcione como una plataforma **multi-tenant segura**, evitando que datos de una organización puedan ser accedidos por otra.

Este documento aplica a:

- consultas SQL
- políticas RLS
- backend services
- endpoints
- llamadas Supabase
- lógica generada por IA o Copilot

---

# Principio Fundamental

Cada registro del sistema pertenece a una organización.

La organización propietaria se identifica mediante:

org_id

Esto permite que múltiples organizaciones compartan la misma infraestructura sin acceder a los datos de otras.

---

# Modelo Multi-Tenant

La arquitectura del sistema es **shared database, shared schema**.

Todas las organizaciones utilizan:

- la misma base de datos
- las mismas tablas
- el mismo backend

El aislamiento se logra mediante:

- org_id
- memberships
- Row Level Security (RLS)

---

# Identificación de Organización

Cada entidad que representa datos operativos debe incluir:

org_id

Ejemplos de tablas que deben incluir org_id:

- geofences
- positions
- tracker_assignments
- tracker_latest
- tracker_geofence_events
- activities
- activity_assignments
- personal
- org_people

Esto permite aplicar políticas de acceso seguras.

---

# Tabla de Membresías

El acceso de usuarios a organizaciones se controla mediante:

memberships

Esta tabla define:

- qué usuario pertenece a qué organización
- qué rol tiene dentro de esa organización

Ejemplo conceptual:

user_id  
org_id  
role

---

# Principio de Acceso

Un usuario puede acceder únicamente a los datos de organizaciones donde tenga membresía.

Regla conceptual:

row.org_id ∈ user's memberships

Esto se implementa mediante políticas de seguridad en la base de datos.

---

# Row Level Security (RLS)

PostgreSQL permite aplicar políticas de acceso a nivel de fila.

Esto garantiza que incluso si una query intenta acceder a datos de otra organización, la base de datos los bloqueará.

Las tablas críticas deben tener RLS habilitado.

Ejemplo conceptual:

ALTER TABLE geofences ENABLE ROW LEVEL SECURITY;

---

# Ejemplo de Política RLS

Una política típica podría verse conceptualmente así:

```sql
CREATE POLICY org_isolation_policy
ON geofences
FOR SELECT
USING (
  org_id IN (
    SELECT org_id
    FROM memberships
    WHERE user_id = auth.uid()
  )
);

Esto garantiza que el usuario solo vea geocercas de organizaciones donde pertenece.

Aislamiento en Consultas

Las consultas deben diseñarse asumiendo el modelo multi-tenant.

Incluso cuando RLS está activo, las consultas deben respetar el contexto de organización.

Ejemplo conceptual:

SELECT id, name
FROM geofences
WHERE org_id = :org_id;

Esto mejora claridad y rendimiento.

Aislamiento en Backend

Los servicios backend deben operar siempre dentro del contexto de una organización.

Esto implica que cada operación debe tener conocimiento de:

org_id

El backend nunca debe ejecutar consultas globales sin justificación administrativa.

Aislamiento en Frontend

El frontend puede mantener el contexto de organización activa para la experiencia del usuario.

Ejemplo:

organización seleccionada en la UI.

Sin embargo, el frontend no es responsable de la seguridad real.

La seguridad debe garantizarse en:

RLS

backend

políticas de base de datos

Aislamiento en Tracking

El pipeline de tracking también debe respetar el aislamiento por organización.

Tablas críticas:

positions
tracker_latest
tracker_geofence_events

Cada registro debe incluir:

org_id

Esto garantiza que los eventos y posiciones no se mezclen entre organizaciones.

Aislamiento en Geocercas

Las geocercas pertenecen a una organización específica.

Consultas espaciales deben filtrar primero por:

org_id

Esto evita evaluar geocercas de otras organizaciones.

Aislamiento en Eventos

Eventos ENTER / EXIT deben registrarse dentro del contexto de la organización.

Tabla:

tracker_geofence_events

Esto garantiza que reportes y dashboards no mezclen datos.

Aislamiento en Analytics

Reportes y dashboards deben ejecutarse dentro del contexto de una organización.

Nunca se deben generar dashboards globales accesibles a usuarios normales.

Solo roles administrativos del sistema podrían tener acceso cross-organization.

Roles y Permisos

El acceso dentro de una organización puede depender del rol.

Ejemplos:

admin
manager
viewer

Sin embargo, incluso los roles más altos solo deben ver datos de su organización.

Casos Especiales

Existen situaciones donde el sistema puede requerir acceso cross-organization:

mantenimiento del sistema

soporte técnico

analytics globales

Estos accesos deben estar limitados a roles administrativos del sistema.

Reglas para IA y Copilot

IA assistants no deben:

generar consultas sin considerar org_id

crear endpoints que devuelvan datos globales

ignorar RLS

deshabilitar políticas de seguridad

asumir acceso cross-organization

Antes de generar queries, la IA debe preguntarse:

¿Qué organización es dueña de estos datos?

¿Existe una membresía válida?

¿La consulta respeta el aislamiento multi-tenant?

Anti-Patterns Prohibidos

Quedan prohibidos estos patrones:

consultas globales sin filtro de organización

deshabilitar RLS temporalmente

resolver seguridad con filtros de frontend

joins que ignoran org_id

endpoints administrativos accesibles a usuarios normales

Auditoría de Seguridad

El sistema debe poder auditar:

accesos a datos

operaciones críticas

cambios en membresías

acciones administrativas

Esto ayuda a detectar problemas de aislamiento.

Objetivo Final

El sistema debe garantizar que cada organización opere dentro de su propio espacio de datos.

La arquitectura debe permitir escalar a:

miles de organizaciones

millones de registros

múltiples usuarios por organización

manteniendo siempre aislamiento completo entre clientes.