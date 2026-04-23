# Backend Fix: invite-tracker endpoint

## Problema

El endpoint `/api/invite-tracker` retornaba error 500 (`invite_internal_error`).

Causa raíz:

- Uso de funciones no definidas:
  - createClient (no importado)
  - getOrgEntitlements (no definida)
  - countActiveTrackers (no definida)

Esto provocaba un crash en runtime.

---

## Solución implementada

Se eliminó la dependencia de funciones externas y se implementó lógica directa con Supabase:

### 1. Validación de plan

Fuente de verdad:

- `org_billing.plan_status`

Regla:

- Solo permitir si `plan_status === "active"`

---

### 2. Obtención de límites

Tabla:

- `plan_limits`

Campo usado:

- `max_trackers`

---

### 3. Conteo de trackers activos

Tabla:

- `tracker_memberships`

Filtro:

- `status = 'active'`

---

### 4. Validación de límite

Regla:
