> ⚠️ SUPERSEDED / HISTÓRICO
>
> Este documento queda como referencia histórica.  
> La fuente viva actual del flujo invite/tracker es:
>
> docs/skills/invite-tracker.md
>
> Regla vigente: signaciones = fuente operativa/UI, 	racker_assignments = espejo runtime Android, 	racker_positions = fuente canónica de posiciones dashboard.

---
# Final Architecture: Trackerâ€“Personal Linkage and Assignment Resolution

## Core Linkage Chain

- **tracker_user_id â†’ personal.user_id â†’ tracker_assignments**
    - Every tracker (user) is linked to a `personal` record via `personal.user_id`.
    - All assignment resolution and permissions are based on this linkage.

## Mandatory Linkage

- `personal.user_id` is **mandatory** for all tracker operations.
- The invite-tracker process must always persist this link:
    - If a matching `personal` exists with `user_id` null, it is updated to the new tracker_user_id.
    - If a conflicting `user_id` exists, the invite fails with a conflict error.
    - After a successful invite, `personal.user_id` is never left null.

## Assignment Source of Truth

- **tracker_assignments** is the only source of truth for active assignments.
    - Assignment is resolved by finding active `tracker_assignments` for the given `tracker_user_id` and `org_id`.
    - Assignment is valid if:
        - `active = true`
        - `tracker_user_id` and `org_id` match
        - Current date/time is within the assignment window (`period_tstz`, `period`, or `start_date`/`end_date`)
    - No `is_deleted` or `status` fields are used in this table.

## Email Fallback

- Email fallback for resolving `personal` is **deprecated**.
- It is only allowed for a one-time backfill/migration and must not be used in production logic.

## Summary

- All tracker operations and assignment resolution must use the chain: `tracker_user_id â†’ personal.user_id â†’ tracker_assignments`.
- The invite-tracker endpoint is responsible for ensuring this linkage is always established and never left incomplete.
- Email-based lookups are no longer supported except for explicit, one-time migration scripts.

## Backfill & Safe Migration Rules

When performing a one-time backfill to populate `personal.user_id` from `auth.users.id`, follow these rules to ensure data integrity:

- **Linkage Criteria:**
    - Only link `personal.user_id` if:
        - `personal.org_id` matches the user's org_id context
        - The email in `personal` matches exactly one `auth.users.email` (unique match)
- **Conflict Handling:**
    - If a `personal` record already has a different `user_id`, **do not overwrite** it.
    - Log all such conflicts for manual review and resolution.
- **No Overwrites:**
    - Never overwrite an existing, non-null `personal.user_id` with a new value during backfill.
- **Validation:**
    - After migration, validate that all tracker flows (invite, assignment resolution, etc.) work as expected for migrated users.
    - Run end-to-end tests to confirm that the linkage chain is intact and no tracker is left unlinked.

> **Note:** These rules are mandatory for any migration or backfill scripts. Email-based linkage is not allowed in production logic after migration is complete.

### Example: Safe Backfill SQL (Postgres)

```sql
-- Find personal records with null user_id and a unique email match in auth.users
WITH unique_email_users AS (
  SELECT
    u.id AS auth_user_id,
    u.email,
    u.created_at,
    ARRAY_AGG(u.id ORDER BY u.created_at, u.id) AS user_ids,
    COUNT(*) OVER (PARTITION BY u.email) AS email_count
  FROM auth.users u
  GROUP BY u.id, u.email, u.created_at
)
UPDATE personal p
SET user_id = (SELECT user_ids[1]::uuid FROM unique_email_users u WHERE u.email = p.email AND u.email_count = 1)
WHERE p.user_id IS NULL
  AND EXISTS (
    SELECT 1 FROM unique_email_users u WHERE u.email = p.email AND u.email_count = 1
  )
  AND NOT EXISTS (
    SELECT 1 FROM personal p2 WHERE p2.email = p.email AND p2.user_id IS NOT NULL AND p2.user_id <> (SELECT user_ids[1]::uuid FROM unique_email_users u WHERE u.email = p.email AND u.email_count = 1)
  );

-- Log conflicts (multiple users for same email, or personal already linked to a different user_id)
SELECT p.id AS personal_id, p.email, p.user_id, u.user_ids
FROM personal p
JOIN (
  SELECT email, ARRAY_AGG(id ORDER BY created_at, id) AS user_ids, COUNT(*) AS email_count
  FROM auth.users
  GROUP BY email
) u ON u.email = p.email
WHERE (u.email_count > 1 OR (p.user_id IS NOT NULL AND p.user_id <> u.user_ids[1]::uuid));
```

- Use `ARRAY_AGG(... ORDER BY created_at, id)` to deterministically pick the first user for each email.
- Only update when the email is unique in auth.users and personal.user_id is null.
- Never overwrite a different existing user_id.
- Log all conflicts for review.

## Invite-Tracker: Enforcing tracker_user_id Linkage

- The invite-tracker endpoint must **always** resolve and return a valid `tracker_user_id` (the auth user id) before attempting to patch or update `personal.user_id`.
- If no `tracker_user_id` is available from the invite or user creation process, the request **must fail** and no changes to `personal` are allowed.
- This ensures that `personal.user_id` is only ever set when a valid, persistent auth user exists, preventing orphaned or inconsistent links.

## ResoluciÃ³n de tracker_user_id en invite-tracker

El endpoint `invite-tracker` debe resolver un `tracker_user_id` vÃ¡lido antes de hacer patch de `personal.user_id`.

Orden obligatorio:
1. intentar obtener `tracker_user_id` desde la respuesta del invite
2. si el invite no devuelve user id, resolver el usuario existente en `auth.users` por email
3. si ninguno de los dos caminos devuelve `tracker_user_id`, fallar la solicitud
4. solo despuÃ©s actualizar `personal.user_id`

Esto evita continuar el flujo con identidad incompleta.
