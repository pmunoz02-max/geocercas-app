You are updating project documentation for **App Geocercas**.

Target file:

docs/TABLE_RELATION_DIAGRAM.md

This change is **documentation-only**.

Do NOT:

* generate SQL
* modify migrations
* modify application code
* modify Supabase configuration

Only update the documentation structure.

---

SOURCE OF TRUTH

All relationships must be validated against:

docs/DB_SCHEMA_MAP.md

Do NOT invent:

* tables
* foreign keys
* structural relationships

If a relationship is not explicitly documented as FK in DB_SCHEMA_MAP.md,
it must NOT be represented as a hard FK edge.

---

GOAL

Refactor TABLE_RELATION_DIAGRAM.md so that relationships are classified explicitly.

The document must distinguish between:

1. FK_CONFIRMED
2. LOGICAL_NON_FK
3. LEGACY_LOGICAL
4. UNVERIFIED

---

STEP 1 — Add relationship legend

At the top of the document add:

Relationship Types

FK_CONFIRMED
Explicit foreign key documented in DB_SCHEMA_MAP.md.

LOGICAL_NON_FK
Logical/domain relationship inferred from documented columns (for example org_id, personal_id, user_id).

LEGACY_LOGICAL
Relationship belonging to legacy or compatibility tables.

UNVERIFIED
Relationship that may exist logically but is not documented clearly in DB_SCHEMA_MAP.md.

---

STEP 2 — Split Mermaid diagrams

Create two diagrams:

A) Canonical Model

Include only:

organizations
memberships
profiles
personal
geofences
asignaciones
activities
activity_assignments
positions
tracker_assignments
tracker_geofence_events
org_billing

Edges must represent **logical relationships only**, except for the one confirmed FK.

Use comments inside Mermaid to label relationships:

FK_CONFIRMED
LOGICAL_NON_FK

---

B) Legacy / Compatibility Model

Include legacy objects such as:

geocercas
tracker_positions
user_organizations
org_members
org_users
invite variants

All edges must be labeled:

LEGACY_LOGICAL

---

STEP 3 — Create explicit FK section

Add section:

Confirmed Foreign Keys

Currently documented FK from DB_SCHEMA_MAP.md:

tracker_geofence_events.geocerca_id -> geofences.id

No other FK must be listed unless explicitly documented in DB_SCHEMA_MAP.md.

---

STEP 4 — Logical relationship section

Create a section listing logical relationships such as:

organizations -> memberships (memberships.org_id)
organizations -> personal (personal.org_id)
organizations -> geofences (geofences.org_id)
organizations -> positions (positions.org_id)
personal -> asignaciones (asignaciones.personal_id)
geofences -> asignaciones (asignaciones.geofence_id)
activities -> asignaciones (asignaciones.activity_id)

These must be explicitly labeled as:

LOGICAL_NON_FK

---

STEP 5 — Remove or downgrade invalid relationships

Downgrade or remove edges that were previously modeled as structural relationships but are not confirmed:

profiles -> tracker_assignments
profiles -> activity_assignments
tracker_logs -> organizations
tracker_latest -> organizations
attendance tables -> organizations
invite tables -> organizations

If kept, classify them as:

UNVERIFIED

---

STEP 6 — Keep RLS notes as documentation only

Ensure the RLS section remains descriptive text.

Do NOT represent RLS as relationships in diagrams.

---

OUTPUT FORMAT

Modify only:

docs/TABLE_RELATION_DIAGRAM.md

Keep the document structure clear and optimized for:

* developers
* architecture reviews
* AI assistants (Copilot / GPT)

Do not modify any other file.
