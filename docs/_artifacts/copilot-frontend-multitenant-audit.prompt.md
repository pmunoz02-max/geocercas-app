You are performing a **frontend multi-tenant security audit** for the project **App Geocercas**.

Your task is to analyze the frontend codebase and detect **queries, joins, data access patterns, and Supabase calls** that could break tenant isolation.

This is an **analysis and documentation-only task**.

Do NOT:

- modify application code
- generate SQL migrations
- modify Supabase policies
- change environment variables
- refactor components automatically

Your output must be an audit report only.

---

# AUDIT TARGET

Create or replace:

docs/FRONTEND_MULTI_TENANT_AUDIT.md

---

# SOURCE OF TRUTH

Architecture and schema documentation:

docs/DB_SCHEMA_MAP.md
docs/TABLE_RELATION_DIAGRAM.md
docs/DATA_FLOW.md
docs/RLS_POLICIES.md
docs/SECURITY_AUDIT.md

Repository codebase:
- frontend React / Vite source files
- Supabase client usage
- hooks
- services
- data access utilities
- pages
- components

If documentation conflicts with code assumptions, treat the documentation as the intended architecture and flag the code pattern as a possible risk.

Do NOT invent undocumented services or backend behavior.

---

# PROJECT CONTEXT

App Geocercas is a **multi-tenant SaaS** platform using:

Frontend:
- React
- Vite
- Leaflet
- Tailwind

Backend:
- Supabase
- PostgreSQL
- Row Level Security (RLS)

Core tenant boundary:
- organizations
- memberships
- org_id

Main risk:
frontend queries or data access flows that accidentally expose cross-organization data.

---

# AUDIT GOAL

Detect frontend patterns that may cause:

- cross-tenant reads
- cross-tenant writes
- missing organization filters
- unsafe joins
- unsafe broad selects
- reliance on underdocumented legacy tables
- data access to UNKNOWN / weakly documented security domains
- queries that assume RLS will save everything without correct tenant scoping

Classify findings as:

CONFIRMED_RISK
POTENTIAL_RISK
DOCUMENTATION_GAP
SAFE_PATTERN

Do not invent vulnerabilities. Only flag risks supported by code patterns and project docs.

---

# WHAT TO SCAN IN THE CODEBASE

Search the frontend for:

- createClient / supabase client usage
- `.from("...")`
- `.select(...)`
- `.insert(...)`
- `.update(...)`
- `.upsert(...)`
- `.delete(...)`
- `.rpc(...)`
- joins / nested selects
- reusable data hooks
- API wrapper files
- service files
- dashboard pages
- admin pages
- tracking views
- map views
- attendance flows
- billing screens

Also inspect:

- route-level loaders
- auth/session context
- organization selection logic
- active organization context
- query helpers
- shared data utilities

---

# REQUIRED DOCUMENT STRUCTURE

Create the report with the following sections.

---

# FRONTEND MULTI-TENANT AUDIT

## 1. Purpose

Explain that this document audits frontend data access patterns for tenant isolation safety.

Clarify:
- the audit focuses on React/Vite code using Supabase
- the goal is to find query patterns that may expose data across organizations
- this is an audit only, not a refactor

---

## 2. Tenant Isolation Model Expected by Frontend

Describe the expected frontend model based on docs:

organizations
memberships
profiles
org-scoped operational data

Explain that frontend queries should normally operate within:
- current authenticated user
- current organization context
- allowed membership scope

---

## 3. Files and Modules Audited

List the most relevant files, hooks, services, or folders inspected.

Group by area, for example:
- auth/session
- organization context
- tracking
- geofences
- assignments
- attendance
- billing
- admin

Do not list irrelevant files.

---

## 4. Query Pattern Analysis

This is the core section.

For each relevant query/access pattern found, document:

- File path
- Query or access summary
- Tables involved
- Tenant isolation expectation
- Risk classification
- Reasoning

Use a structured format.

Example:

### Finding: positions query without explicit org scoping
File: src/features/tracking/hooks/usePositions.ts
Tables: positions
Pattern: broad select from positions with user/session dependency but no visible org filter
Risk: POTENTIAL_RISK
Reasoning: positions is organization-scoped in architecture docs; relying entirely on implicit RLS may be acceptable, but lack of explicit tenant context in frontend increases audit burden.

Do not paste huge code blocks.
Summarize the relevant pattern concisely.

---

## 5. High-Risk Query Patterns to Detect

Specifically look for and report these patterns if present:

### A. Broad table reads
Examples:
- select * from organization-scoped operational tables
- list queries with no visible tenant context

### B. Weak tenant filtering
Examples:
- filtering by user_id only when org_id is the real tenant boundary
- filtering by personal_id without validating organization membership

### C. Legacy table usage
Examples:
- geocercas instead of geofences
- tracker_positions instead of positions
- user_organizations / org_users / org_members usage

### D. Unsafe nested selects or joins
Examples:
- pulling related rows across organization boundaries
- nested selects that do not clearly preserve org scope

### E. RPC usage with unclear tenant safety
Examples:
- rpc calls without visible org parameter or tenant context
- rpc calls touching tracking, attendance, billing, or assignments

### F. Writes without strong tenant context
Examples:
- insert/update/upsert into organization-scoped tables without explicit org_id handling
- forms depending on default values not visible in code

### G. Admin screens with broad access
Examples:
- organization lists
- billing views
- user management
- reports / exports

---

## 6. Safe Patterns Identified

Document patterns that appear well-designed.

Examples:
- active organization context used centrally
- reusable hooks enforcing org scope
- membership checked before operational queries
- reads scoped by current org selection
- writes attaching org_id explicitly from controlled context

Mark these as:

SAFE_PATTERN

This section is mandatory.

---

## 7. Risk by Domain

Summarize findings by domain:

### Identity / Membership
### Geofences / Territorial config
### Tracking
### Assignments / Activities
### Attendance
### Billing
### Legacy compatibility

For each domain, summarize:
- main query style observed
- main risk level
- documentation mismatch if any

---

## 8. RPC and Special Access Surface

Audit frontend use of:
- `.rpc(...)`
- admin helper endpoints
- service role proxies if referenced
- export/report utilities

For each case, explain whether tenant isolation is:
- visible
- assumed
- unclear

Mark unclear cases as:

DOCUMENTATION_GAP or POTENTIAL_RISK

---

## 9. Highest Priority Findings

Create a priority table.

Format:

Finding | File/Area | Domain | Severity | Classification | Confidence
------- | --------- | ------ | -------- | -------------- | ----------
Broad positions read | tracking hook | Tracking | High | POTENTIAL_RISK | LIKELY

Severity values:
- High
- Medium
- Low

Classification values:
- CONFIRMED_RISK
- POTENTIAL_RISK
- DOCUMENTATION_GAP
- SAFE_PATTERN

Confidence values:
- CONFIRMED
- LIKELY
- INFERRED
- UNKNOWN

---

## 10. Recommended Refactor Targets

Provide documentation-level recommendations only.

Examples:
- centralize current organization context before operational queries
- wrap Supabase access in org-scoped services
- phase out legacy table usage in frontend
- review RPC calls touching tracking/billing
- require explicit org_id handling in writes
- add audit comments to risky hooks

Do NOT rewrite code.
Do NOT generate patches.
Only recommend areas to inspect/refactor.

---

## 11. Copilot Refactor Queue

Create a practical queue of the best next files to inspect manually with Copilot.

Format:

1. path/to/file.tsx — why it is risky
2. path/to/hook.ts — why it is risky
3. path/to/service.ts — why it is risky

Prioritize files with:
- broad Supabase access
- tracking queries
- admin/billing access
- legacy table usage

This section is mandatory.

---

# AUDIT METHOD

When scanning code, pay special attention to:

- any `.from("positions")`
- any `.from("tracker_geofence_events")`
- any `.from("geofences")` or `.from("geocercas")`
- any `.from("asignaciones")`
- any `.from("activities")`
- any `.from("org_billing")`
- any `.from("attendances")`, `.from("asistencias")`, `.from("attendance_events")`
- any `.rpc(...)`
- organization selection state
- membership loading logic
- route guards
- dashboard summary queries
- map data loaders

---

# STYLE RULES

Write in clear technical English.

Use concise, audit-style language.

Do not paste long code excerpts.

Summarize findings precisely and tie them to:
- file
- table/domain
- tenant boundary expectation
- risk reason

---

# CRITICAL RULES

1. Do not modify code.
2. Do not invent vulnerabilities.
3. Use docs/DB_SCHEMA_MAP.md as architectural source of truth.
4. Distinguish real risk from documentation gap.
5. Modify only:

docs/FRONTEND_MULTI_TENANT_AUDIT.md

---

# OUTPUT

Generate a complete audit report at:

docs/FRONTEND_MULTI_TENANT_AUDIT.md