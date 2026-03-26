You are performing a **multi-tenant security audit** for the project **App Geocercas**.

Your task is to analyze the system architecture and documentation to detect potential **tenant isolation risks**.

This is a **documentation and analysis task only**.

DO NOT:

- generate SQL migrations
- modify database schema
- modify Supabase policies
- modify application code
- modify configuration files

Your output must be a **security audit report only**.

---

# AUDIT TARGET

Create or replace the file:

docs/SECURITY_AUDIT.md

---

# SOURCE OF TRUTH

Primary source:

docs/DB_SCHEMA_MAP.md

Supporting sources:

docs/TABLE_RELATION_DIAGRAM.md  
docs/DATA_FLOW.md  
docs/RLS_POLICIES.md  
docs/DB_OVERVIEW.md  
docs/MAPA_TECNICO.md  

If documentation conflicts, **DB_SCHEMA_MAP.md is authoritative**.

Do NOT invent tables, policies, or services not documented in these files.

---

# PROJECT CONTEXT

App Geocercas is a **multi-tenant SaaS platform**.

Key architectural characteristics:

Supabase backend  
PostgreSQL database  
Row Level Security (RLS)  
Multi-organization isolation  
Operational GPS tracking system

Core domains:

organizations  
memberships  
profiles  
personal  
geofences / geocercas  
asignaciones  
activities  
positions  
tracker_assignments  
tracker_geofence_events  
attendance domain  
billing domain

The most common tenant boundary is:

org_id

But not all tables may enforce it equally.

---

# AUDIT GOAL

Identify potential risks where **data from one organization could become visible to another organization**.

Focus on:

- missing tenant keys
- missing RLS coverage
- legacy schema exposure
- RPC/service role risks
- data flow that bypasses tenant isolation
- joins that could break organization scoping

The audit must distinguish between:

CONFIRMED_RISK  
POTENTIAL_RISK  
DOCUMENTATION_GAP  
NO_RISK_IDENTIFIED

---

# REQUIRED DOCUMENT STRUCTURE

Create the file with the following sections.

---

# MULTI-TENANT SECURITY AUDIT

## 1. Purpose

Explain that this document audits the **tenant isolation model** of App Geocercas.

Clarify:

- The system is designed to isolate data by organization.
- This audit analyzes schema documentation, data flow, and RLS documentation.

This document **does not change the system**, it only analyzes risks.

---

## 2. Multi-Tenant Architecture Overview

Describe the intended tenant boundary model.

Expected logical structure:

organizations  
↓  
memberships  
↓  
users / profiles  
↓  
organization-scoped operational data

Explain that:

org_id is the most common tenant key.

But some tables may rely on **indirect scoping** via joins.

---

## 3. Tenant Boundary Keys

Analyze how tenant isolation is represented in the schema.

Focus on keys such as:

org_id  
user_id  
personal_id  

Explain how these keys propagate through:

operational tables  
tracking tables  
assignment tables

Highlight any tables where tenant boundary is **not obvious**.

---

## 4. Tables Without Explicit Tenant Key

Identify tables documented in DB_SCHEMA_MAP.md that may not contain:

org_id

or another clear tenant key.

Examples might include:

tracker_logs  
tracker_latest  
tracker_positions  
activity_assignments  

Mark each table as:

CONFIRMED_RISK  
POTENTIAL_RISK  
or DOCUMENTATION_GAP

depending on documentation clarity.

---

## 5. RLS Coverage Analysis

Using docs/RLS_POLICIES.md, analyze whether critical domains appear protected by RLS.

Domains to check:

organizational data  
operational entities  
territorial configuration  
tracking data  
attendance data  
billing data

Explain if:

- RLS coverage appears consistent
- RLS documentation is incomplete
- RLS coverage is unclear

Do NOT invent policy SQL.

---

## 6. Tracking System Isolation

Analyze the tracking pipeline documented in DATA_FLOW.md:

tracker_assignments  
positions  
tracker_geofence_events  
tracker_latest  

Explain possible isolation risks such as:

cross-organization tracking visibility  
event leakage between tenants  
latest-position tables bypassing tenant filters

Mark findings carefully as:

POTENTIAL_RISK or DOCUMENTATION_GAP unless confirmed.

---

## 7. Legacy Schema Exposure

Analyze legacy tables such as:

geocercas  
tracker_positions  
membership variants  
attendance variants

Explain how legacy tables could introduce security risks if:

- they lack RLS
- they lack org_id
- they are still queried by frontend code

Mark as:

POTENTIAL_RISK unless documented otherwise.

---

## 8. Indirect Tenant Scoping Risks

Explain risks where tenant isolation depends on joins rather than direct keys.

Example patterns:

positions → personal → org_id  
events → geofence → org_id

Discuss risks such as:

incorrect join conditions  
missing filters  
incorrect RPC usage

Do not claim confirmed vulnerabilities unless documentation proves it.

---

## 9. Service Role / RPC Risk Surface

Explain potential risk areas involving:

Supabase service role  
RPC SQL functions  
background processes

Examples of risk patterns:

service role bypassing RLS  
RPC returning cross-tenant data  
tracking ingestion bypassing tenant checks

If these mechanisms are not documented, classify as:

DOCUMENTATION_GAP

---

## 10. Highest Priority Risk Areas

Summarize the **most important risks identified**.

List them in order of priority.

Example format:

Risk | Domain | Severity | Confidence
---- | ------ | -------- | ----------
Missing tenant key | tracking logs | medium | inferred
Legacy tables | attendance | medium | inferred
Indirect tenant scoping | positions | low | inferred

Confidence values:

CONFIRMED  
LIKELY  
INFERRED  
UNKNOWN

---

## 11. Recommended Security Improvements

Provide **documentation-level recommendations**, not implementation code.

Examples:

document all tenant keys  
map RLS policies to tables  
audit legacy schema access  
verify RPC tenant filtering  
audit service-role usage  

These must remain **architectural recommendations**, not SQL patches.

---

# STYLE RULES

Write in clear technical English.

Use structured sections and tables.

Avoid speculation unless clearly marked as:

POTENTIAL_RISK  
DOCUMENTATION_GAP

---

# CRITICAL RULES

1. Do not invent vulnerabilities.
2. Do not modify system code.
3. Respect DB_SCHEMA_MAP.md as authoritative.
4. Distinguish risk vs documentation gap.
5. Modify only:

docs/SECURITY_AUDIT.md

---

# OUTPUT

Generate a **complete multi-tenant security audit report** at:

docs/SECURITY_AUDIT.md