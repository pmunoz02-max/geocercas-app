SaaS_LIMITS_AND_ENTITLEMENTS.md
1. Purpose

This document defines the SaaS limits and entitlements model for App Geocercas.

It establishes:

operational limits per organization

features enabled per SaaS plan

tracking frequency constraints

geofence limits

data retention policies

billing integration

The objective is to support scalable monetization while maintaining system stability.

This document complements:

docs/TRACKING_SCALABILITY_DECISION.md

docs/TRACKING_DATA_RETENTION_POLICY.md

docs/DB_SCHEMA_MAP.md

2. SaaS Model Overview

App Geocercas operates as a multi-tenant SaaS platform where organizations subscribe to plans that determine:

resource limits

available features

data retention

tracking capacity

Each organization is identified by:

org_id

Plan information is stored in:

org_billing

## Enforcement de Planes y Límites (Preview)

### 1. Fuente de verdad de límites
- La vista `org_entitlements` es la única fuente de verdad para límites efectivos por organización.
- Nunca se debe usar directamente `org_billing` para enforcement de límites.

### 2. Fallback backend
- Si una Edge Function o flujo backend no puede consultar la vista `org_entitlements`, debe usar la función SQL `resolve_effective_plan_code` y complementar con los datos de `org_billing` para determinar el plan efectivo y aplicar los límites correspondientes.

### 3. Separación de responsabilidades
- `org_billing` almacena únicamente el estado comercial de la suscripción (campos: `plan_code`, `subscribed_plan_code`, `plan_status`, `billing_provider`, `customer_id`, `subscription_id`).
- `org_entitlements` expone los límites efectivos y capacidades del sistema para cada organización.

### 4. Regla de consistencia
- Si existe discrepancia entre `org_billing` y `org_entitlements`, el enforcement SIEMPRE usa `org_entitlements`.

### 5. Backend enforcement obligatorio
- Toda operación limitada (por ejemplo, creación de trackers, geocercas, features premium) debe validar los límites en backend antes de ejecutar la acción.

### 6. Frontend
- El frontend solo refleja límites y estado, nunca es barrera de seguridad.

### 7. Logging obligatorio
- En cada denegación por límite se debe registrar:
	- `org_id`
	- `plan_code`
	- `operation`
	- `limit`
	- `current_count`
	- `reason`

### 8. Contexto Paddle
- Paddle activa y actualiza `org_billing` vía webhook.
- El enforcement operativo depende exclusivamente de `org_entitlements`.
- Esta separación desacopla la facturación de las capacidades del sistema.

### 9. Ejemplo concreto: creación de trackers

**Flujo de enforcement:**
1. Obtener el plan y límites efectivos desde `org_entitlements` para el `org_id` correspondiente.
2. Contar la cantidad actual de trackers activos para la organización.
3. Comparar con el límite `max_trackers`.
4. Si el límite se excede, rechazar la operación y registrar el evento de acuerdo a la política de logging.
5. Si no se excede, permitir la creación del tracker.

**Ejemplo SQL:**
```sql
-- Obtener límites efectivos
SELECT max_trackers FROM org_entitlements WHERE org_id = :org_id;

-- Contar trackers actuales
SELECT COUNT(*) FROM trackers WHERE org_id = :org_id AND status = 'active';

-- Lógica de enforcement (pseudocódigo)
IF current_count >= max_trackers THEN
	-- Loguear denegación con org_id, plan_code, operation, limit, current_count, reason
	RAISE EXCEPTION 'Tracker limit reached';
END IF;
```

### 10. Restricciones
- No crear nuevas tablas.
- No cambiar contratos existentes.
- No modificar la estructura de `org_billing`.
- No modificar SQL existente; solo documentar el uso correcto.

---
Feature	Limit
Trackers	100
Geofences	200
Tracking frequency	30–60 seconds
Position retention	90 days
Event retention	180 days
Admins	10
Enterprise Plan
Feature	Limit
Trackers	unlimited
Geofences	unlimited
Tracking frequency	configurable
Position retention	365+ days
Event retention	unlimited
Admins	unlimited
6. Tracker Limits

Trackers represent the primary cost driver in tracking systems.

Each active tracker generates:

continuous GPS updates

geofence evaluations

event records

storage usage

Limits should apply to:

active tracker assignments

Operational reference tables:

personal
tracker_assignments
positions
7. Geofence Limits

Geofence count affects:

spatial evaluation complexity

geofence engine workload

UI rendering complexity

Limits should apply to:

geofences

Active geofence count should be measured per:

org_id
8. Tracking Frequency Limits

Tracking frequency directly impacts system load.

Example intervals:

Frequency	Positions per tracker/day
5 minutes	288
1 minute	1,440
30 seconds	2,880

Lower intervals increase:

database writes

geofence evaluations

storage usage

Plans should enforce minimum allowed intervals.

9. Data Retention Limits

Retention policies should align with SaaS plans.

Plan	Position retention
Basic	30 days
Professional	90 days
Enterprise	365+ days

Retention affects:

positions
tracker_geofence_events

Policies must align with:

docs/TRACKING_DATA_RETENTION_POLICY.md
10. Feature Entitlements

Certain features may only be available in higher tiers.

Examples:

Feature	Description
Advanced reports	historical analytics
Custom alerts	geofence notifications
API access	external integrations
Automation rules	workflow triggers
Audit logs	compliance tracking

These features can be toggled per plan.

11. Billing Integration

Plan information is stored in:

org_billing

Example attributes:

plan_code

plan_status

tracker_limit_override

over_limit

The billing system determines whether an organization can:

create new trackers

create geofences

increase frequency

access advanced features

12. Limit Enforcement Strategy

Limits can be enforced in multiple layers.

Application layer

UI prevents creation of resources beyond limits.

Examples:

block new trackers

block new geofences

API layer

Backend validates limits before processing requests.

Database layer

Optional constraints prevent invalid inserts.

13. Over-Limit Handling

When organizations exceed limits:

Possible responses include:

Strategy	Description
Soft limit	warn but allow
Hard limit	block new resources
Grace period	allow temporary excess
Automatic upgrade	prompt plan change
14. Upgrade and Downgrade Behavior

When plans change:

Upgrade

increased limits apply immediately

new features become available

Downgrade

System may require:

removing excess trackers

disabling some geofences

shortening retention windows

15. Usage Monitoring

To support billing and operations, the system should track:

number of active trackers

number of geofences

tracking frequency

storage consumption

event generation volume

These metrics support:

billing transparency

system monitoring

capacity planning

16. Future Monetization Features

Potential SaaS extensions include:

per-tracker pricing

geofence event alerts pricing

advanced analytics add-ons

API usage quotas

premium automation workflows

These features build on the core entitlement model.