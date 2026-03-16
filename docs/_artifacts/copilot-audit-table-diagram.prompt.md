You are auditing documentation for the project **App Geocercas**.

Your task is to validate the document:

docs/TABLE_RELATION_DIAGRAM.md

against the source-of-truth schema document:

docs/DB_SCHEMA_MAP.md

IMPORTANT RULES

1. **DB_SCHEMA_MAP.md is the only source of truth.**

You must not invent:

* tables
* columns
* foreign keys
* relationships
* RPC functions
* views

If a relationship is not explicitly documented or clearly derivable from DB_SCHEMA_MAP.md, it must NOT appear as a confirmed FK.

---

2. DO NOT modify runtime code.

This task is **documentation auditing only**.

Do NOT:

* generate SQL
* modify migrations
* change backend code
* change frontend code

Only analyze and improve documentation.

---

3. DO NOT introduce new tables.

Use only tables already documented in:

docs/DB_SCHEMA_MAP.md

---

AUDIT TASK

Open and analyze:

docs/TABLE_RELATION_DIAGRAM.md

Then perform the following checks.

---

STEP 1 — Validate Mermaid relationships

For each arrow in the Mermaid diagram:

Verify that the relationship exists in DB_SCHEMA_MAP.md.

Classify each relationship as one of:

A) Confirmed FK
Explicitly documented foreign key.

B) Logical relationship
Linked by columns such as org_id but without formal FK.

C) Legacy compatibility
Tables kept for historical compatibility.

If a relationship cannot be justified from DB_SCHEMA_MAP.md, flag it as:

INVALID RELATION

---

STEP 2 — Separate canonical vs legacy models

Ensure the document clearly separates:

Canonical model
(current architecture)

Legacy / compatibility objects
(historical or transitional)

Examples of typical transitions:

geocercas → geofences
tracker_positions → positions
tenant_id → org_id

Legacy tables must not appear as primary architecture.

---

STEP 3 — Validate multi-tenant structure

Confirm that the multi-tenant model is represented correctly:

organizations
↓
memberships
↓
users

Check that references using **org_id** are not incorrectly represented as FK if not defined as such.

---

STEP 4 — Review RLS notes

RLS should appear only as **documentation notes**.

RLS must NOT be represented as structural relationships in the diagram.

---

STEP 5 — Produce corrected structure

If issues are detected, propose a corrected structure for TABLE_RELATION_DIAGRAM.md with:

1️⃣ Canonical relationship diagram
2️⃣ Legacy / compatibility diagram
3️⃣ Confirmed FK reference list
4️⃣ Logical relationships (non-FK)
5️⃣ Architecture notes (org_id, RLS, transitions)

---

OUTPUT FORMAT

Do NOT rewrite the entire file unless necessary.

Instead provide:

SECTION 1 — VALID RELATIONSHIPS
SECTION 2 — INVALID OR UNVERIFIED RELATIONSHIPS
SECTION 3 — LEGACY OBJECTS IDENTIFIED
SECTION 4 — SUGGESTED IMPROVEMENTS
SECTION 5 — OPTIONAL MERMAID CORRECTION

---

GOAL

Ensure that:

docs/TABLE_RELATION_DIAGRAM.md

is **100% consistent with DB_SCHEMA_MAP.md** and does not introduce undocumented relationships.
