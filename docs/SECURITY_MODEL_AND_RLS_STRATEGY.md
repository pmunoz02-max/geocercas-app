SECURITY_MODEL_AND_RLS_STRATEGY.md
1. Purpose

This document defines the security model and Row Level Security (RLS) strategy for App Geocercas.

The platform operates as a multi-tenant SaaS system, where multiple organizations share the same database while maintaining strict data isolation.

This document describes:

tenant isolation model

organization boundary enforcement

RLS policy strategy

role-based access

tracking data protection

security best practices

This document complements:

docs/DB_SCHEMA_MAP.md

docs/RLS_POLICIES.md

docs/SECURITY_AUDIT.md

docs/SaaS_LIMITS_AND_ENTITLEMENTS.md

2. Security Principles

The security architecture of App Geocercas follows these core principles.

Tenant Isolation

Data belonging to one organization must never be accessible by another organization.

Least Privilege

Users should only access the minimum data required for their role.

Explicit Access Control

All data access must be validated through membership and role checks.

Defense in Depth

Security should be enforced at multiple layers:

database

API

application

3. Multi-Tenant Isolation Model

The primary tenant boundary in the system is:

org_id

Every operational table must be scoped by organization.

Examples include:

personal

geofences

asignaciones

positions

tracker_assignments

tracker_geofence_events

All queries must be filtered by org_id.

This rule ensures tenant data isolation.

4. Organization Membership Model

Access to organization data is controlled through:

memberships

Key fields include:

org_id

user_id

role

revoked_at

Membership defines:

which organizations a user belongs to

the user's role within that organization

5. Role-Based Access Model

Users may have different roles within an organization.

Typical roles include:

Role	Permissions
owner	full control
admin	organization management
tracker	location reporting
viewer	read-only access

Permissions should be evaluated together with membership.

6. Row Level Security (RLS)

Row Level Security ensures that database queries only return rows the user is authorized to access.

RLS must be enabled on all tenant-scoped tables.

Examples include:

personal

geofences

asignaciones

positions

tracker_assignments

tracker_geofence_events

RLS policies typically enforce:

row.org_id ∈ user's memberships
7. Context Resolution

The system must determine the active organization context for each request.

This context may be derived from:

authenticated user session

profiles.current_org_id

explicit organization selection in UI

The active organization must be validated against the user's memberships.

8. Query Safety Rules

To prevent cross-tenant leaks, the following rules apply.

Mandatory org filter

All queries must include:

org_id = current_org_id
Avoid global queries

Queries without tenant filters must be avoided.

Enforce RLS

RLS must always remain enabled in production environments.

9. Sensitive Data Protection

Tracking data is considered sensitive.

Examples include:

GPS positions

movement history

geofence events

Sensitive tables include:

positions
tracker_latest
tracker_geofence_events

Access to these tables must be restricted to authorized organization members.

10. Admin-Level Access

Administrative users may require broader permissions.

Possible capabilities include:

managing members

creating geofences

assigning trackers

viewing organization reports

However, even administrators must remain restricted to their organization scope.

11. API Security

All API endpoints must enforce security checks.

Validation steps should include:

user authentication

organization membership validation

role authorization

resource ownership verification

No API endpoint should bypass these checks.

12. Data Write Protection

Write operations must also respect tenant boundaries.

Examples:

inserting positions

creating geofences

assigning trackers

The system must verify that:

org_id in request = user's organization

Unauthorized writes must be rejected.

13. Security Logging

Security-related events should be logged.

Examples include:

login attempts

permission violations

suspicious access patterns

membership changes

Logs should include:

timestamp

user identity

organization context

action performed

14. RLS Testing Strategy

RLS policies must be validated with systematic tests.

Recommended tests include:

Test	Description
cross-org access	ensure blocked
invalid org context	ensure denied
role escalation	ensure prevented
tracker data isolation	verify separation

These tests protect against accidental policy regressions.

15. Protection Against Data Leakage

The system must prevent several common leakage scenarios.

Examples include:

API endpoints returning global data

joins across organizations

missing org_id filters

incorrect RLS policies

Regular audits must verify tenant isolation.

16. Security Monitoring

Security monitoring should detect suspicious behavior.

Examples:

repeated access violations

abnormal API usage

attempts to access other organizations

excessive query activity

These signals may indicate:

misconfiguration

attempted attacks

bugs in the access model

17. Data Export and Reporting

Export features must respect tenant boundaries.

Examples:

CSV exports

analytics reports

historical tracking downloads

Exports must only contain data belonging to the requesting organization.

18. Future Security Enhancements

Future improvements may include:

multi-factor authentication

API token scopes

audit trail improvements

anomaly detection for tracking data

encryption of sensitive location data

These enhancements further strengthen the platform security model.