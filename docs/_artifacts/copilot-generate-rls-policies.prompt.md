You are documenting Row Level Security (RLS) for the project **App Geocercas**.

Your task is to create or fully replace:

docs/RLS_POLICIES.md

This is a **documentation-only task**.

Do NOT:

- generate SQL
- modify Supabase policies
- create migrations
- modify database schema
- modify application code

You are only documenting existing RLS architecture and security model.

---

# SOURCE OF TRUTH

Primary source:

docs/DB_SCHEMA_MAP.md

Supporting documentation (if available):

docs/DB_OVERVIEW.md  
docs/DATA_FLOW.md  
docs/TABLE_RELATION_DIAGRAM.md  
docs/MAPA_TECNICO.md

If any conflict appears, **DB_SCHEMA_MAP.md is authoritative**.

If the documentation does not explicitly describe RLS behavior, mark the behavior as:

INFERRED_SECURITY_MODEL

Never present inferred security assumptions as confirmed.

---

# PROJECT CONTEXT

App Geocercas is a **multi-tenant SaaS** platform.

Main domains include:

- organizations
- memberships
- profiles
- personal / org_people
- geofences / geocercas
- asignaciones
- activities
- tracking system (positions, tracker_assignments, tracker_geofence_events)
- attendance
- billing

The platform uses:

Supabase  
PostgreSQL  
Row Level Security (RLS)

The most common tenant boundary is expected to be:

org_id

However, not every table necessarily enforces it the same way.

---

# DOCUMENT GOAL

Create a clear technical reference explaining:

- how tenant isolation is implemented
- how access is scoped per organization
- what tables should be protected by RLS
- how memberships influence access
- potential risks or gaps

The document must help:

- developers
- auditors
- maintainers
- AI assistants (Copilot / GPT)

understand the **security model of the system**.

---

# REQUIRED DOCUMENT STRUCTURE

The document must contain the following sections.

---

# RLS POLICIES

## 1. Purpose

Explain that this document describes how **Row Level Security protects multi-tenant data** in App Geocercas.

Clarify that:

- RLS ensures organizations cannot access each other's data.
- policies may be explicit or inferred from architecture documentation.

State clearly:

This document **does not modify policies**, it only documents them.

---

## 2. Multi-Tenant Security Model

Explain the general model used in the platform.

Expected structure:

organizations  
↓  
memberships  
↓  
profiles / users  
↓  
organization-scoped data

Clarify the role of:

org_id

Important note:

org_id relationships often represent **logical tenant boundaries**, not necessarily SQL foreign keys.

---

## 3. Security Domains

Group tables by domain to make the security model understandable.

### Identity and Membership

organizations  
memberships  
profiles  

Explain how access to organizations likely depends on membership.

If exact policy logic is not documented, label it:

INFERRED_SECURITY_MODEL

---

### Operational Entities

personal  
org_people  

Explain how operational identities relate to organizations.

---

### Territorial Configuration

geofences  
geocercas  
asignaciones  

Explain how geofence data should be restricted per organization.

Note legacy coexistence if applicable.

---

### Activity and Assignment Domain

activities  
activity_assignments  

Explain how activity definitions and assignments relate to organization scope.

---

### Tracking Domain

positions  
tracker_assignments  
tracker_geofence_events  
tracker_logs  
tracker_latest  

Explain how tracking data should be isolated per organization.

Important:

If org_id exists in these tables, describe its role in RLS filtering.

If not documented, mark as inferred.

---

### Attendance Domain (if documented)

attendances  
asistencias  
attendance_events  

If schema documentation is weak, explicitly mark this domain as **transitional or underdocumented**.

---

### Billing Domain

org_billing

Explain how billing data should be restricted to organization administrators.

If policy behavior is undocumented, mark as inferred.

---

## 4. Typical RLS Policy Patterns

Document common policy patterns likely used in the system.

Examples may include:

Organization-scoped read

user can read rows where:

org_id IN (
  organizations where user has membership
)

Membership validation

user must belong to organization to read/write operational data.

Owner-based access

user_id = auth.uid()

Important:

These examples must be presented as **patterns**, not confirmed SQL policies unless explicitly documented.

---

## 5. Table-Level Security Overview

Create a table summarizing RLS expectations.

Example format:

Table | Expected Tenant Key | Security Scope | Confidence
----- | ------------------ | -------------- | ----------
organizations | id | membership based | inferred
memberships | org_id | membership ownership | inferred
personal | org_id | organization scope | inferred
geofences | org_id | organization scope | inferred
positions | org_id | organization scope | inferred
tracker_geofence_events | org_id | organization scope | inferred
org_billing | org_id | admin restricted | inferred

Confidence values:

CONFIRMED  
INFERRED  
UNKNOWN

Only mark CONFIRMED if documentation explicitly states it.

---

## 6. RLS and Data Flow Interaction

Explain how RLS interacts with system flows described in:

docs/DATA_FLOW.md

Examples:

tracking ingestion  
geofence event generation  
assignment lookup  

Clarify that:

RLS applies to **queries**, not to internal logical processes.

---

## 7. Potential Security Risks

Identify possible risks if policies are incomplete.

Examples:

cross-organization data leakage  
tracking visibility across tenants  
assignment visibility errors  
legacy tables bypassing org scope  

These must be framed as **possible risks**, not confirmed vulnerabilities.

---

## 8. Legacy and Transitional Areas

Document domains where RLS behavior may be inconsistent due to legacy schema.

Examples:

geocercas vs geofences  
tracker_positions vs positions  
membership table variants  
attendance table variants  

Explain why these areas require careful auditing.

---

## 9. Recommended RLS Audit Checklist

Provide a checklist for developers.

Examples:

verify all operational tables contain org_id  
verify policies filter by membership  
verify admin roles for billing  
verify legacy tables are not exposed without filtering  
verify tracker ingestion cannot bypass tenant scope  

This checklist must remain **documentation guidance**, not enforcement code.

---

## 10. Future Documentation Improvements

Recommend additional documentation:

RLS policy SQL mapping  
auth role definitions  
RPC security model  
service-role usage  
tracking ingestion security  
admin privilege model  

---

# STYLE RULES

Write in clear technical English.

Use concise architecture language.

Prefer structured sections and tables.

Avoid speculation unless clearly marked as:

INFERRED_SECURITY_MODEL

---

# CRITICAL RULES

1. Do not invent RLS policies.
2. Distinguish documented vs inferred behavior.
3. Respect DB_SCHEMA_MAP.md as source of truth.
4. Do not modify any file except:

docs/RLS_POLICIES.md

---

# OUTPUT

Generate a **complete documentation file** at:

docs/RLS_POLICIES.md