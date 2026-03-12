# Base de Datos – Overview

**Base de datos:** PostgreSQL (Supabase)

## Tablas principales

### organizations

Contiene organizaciones del sistema.

**Campos clave:**
- id
- name
- created_at

### memberships

Relaciona usuarios con organizaciones.

**Campos:**
- user_id
- org_id
- role

**Roles posibles:**
- owner
- admin
- tracker

### personal

Lista de trabajadores.

**Campos:**
- id
- name
- user_id
- org_id

### geofences

Define zonas geográficas.

**Campos:**
- id
- org_id
- geometry
- active

### tracker_positions

Registro de posiciones GPS.

**Campos:**
- id
- user_id
- lat
- lng
- timestamp

## Seguridad

Se usa:
- RLS (Row Level Security)

**Regla principal:**
- usuarios solo ven datos de su organización.

## Funciones SQL

**Funciones clave:**
- ensure_org_for_current_user
- create_asignacion
- list_asignaciones_ui