# Security test coverage and Vitest alignment preview

Date: 2026-10-18

## Scope

This preview note documents the validation work carried out around three related areas:

- security checks for the activities endpoint
- alignment of the invite-tracker mocks with the real Supabase queries
- Vitest discovery/configuration for both `src` and `api` tests

This is a test and validation record only. No backend permissions were relaxed and no production behavior was changed.

## 1) Security tests for activities

The file [api/actividades.test.js](../api/actividades.test.js) covers the authorization contract for the activities API.

### Verified scenarios

The test suite validates that the handler rejects unauthorized access before the query reaches the `activities` table in the following cases:

- no org membership found
- inactive membership (`is_active = false`)
- active tracker without owner/admin role

### Security intent

The real handler behavior is intentionally strict:

- `resolveContext()` blocks access when the user has no membership in the target org
- it blocks inactive memberships
- it rejects non-owner/non-admin writes even when the membership exists
- it ensures no `activities` insert/select/update/delete is executed once the guard fails

The tests confirm the enforcement by asserting both the HTTP status and the absence of calls to `activities`:

- `403` + `membership_not_found`
- `403` + `membership_inactive`
- `403` + `owner_or_admin_required`

This is a regression guard against unauthorized reads/writes against the activities table.

## 2) Invite-tracker mock alignment

The file [api/invite-tracker.test.js](../api/invite-tracker.test.js) initially mocked stale table names and query shapes that did not match the real handler implementation.

### Root mismatch

The real handler in [api/invite-tracker.js](../api/invite-tracker.js) validates the plan and quota using:

- `org_billing`
- `personal`
- `org_entitlements`
- `memberships`

The test mocks were incorrectly shaped around older names such as:

- `plan_limits`
- `tracker_memberships`

Those are not the tables/queries the real handler uses. As a result, the mock returned a missing entitlement row and the real logic exited with `403 plan_unavailable` before the invite call path could complete.

### Corrected mock contract

The fixed mocks were aligned to the real usage:

- `org_entitlements` with `.select(...).eq("org_id", org_id).maybeSingle()`
- `memberships` with count validation for `role = "tracker"` and `revoked_at IS NULL`

This preserves the original test assertions and cases while matching the real backend contract. No permissions were relaxed.

### Validation result

Verified with:

```bash
npx vitest run api/invite-tracker.test.js
```

Result:

- 1 file passed
- 3 tests passed
- 0 failed

## 3) Vitest discovery and config

The project config in [vite.config.js](../vite.config.js) includes the current Vitest setup.

### Relevant configuration

The `test` block includes:

- `environment: "jsdom"`
- `globals: true`
- `setupFiles: ["./src/test/setup.js"]`
- `include: ["src/**/*.test.{js,jsx,ts,tsx}", "api/**/*.test.js"]`

This ensures that both frontend tests and API tests are discovered in the same run.

### Why this mattered

Without this include list, Vitest would only pick up the default `src` tests, leaving the API tests undiscovered. That was part of the earlier suite mismatch and caused confusion during validation.

## 4) Full-suite validation

Validated with:

```bash
npx vitest run
```

Result from the most recent full run:

- 30 test files passed
- 266 tests passed
- 0 failed

### Warning observed

The run emitted a Browserslist warning, but it did not cause any test failures:

```text
Browserslist: browsers data (caniuse-lite) is 7 months old. Please run:
  npx update-browserslist-db@latest
```

That warning is informational and unrelated to the security or mock fixes.

## Summary

This preview record confirms the following:

- the activities authorization tests are enforcing the expected access model
- the invite-tracker mocks now reflect the actual Supabase contract used by the handler
- Vitest is correctly discovering both `src` and `api` tests
- the repository is in a green state for the current test suite

No code paths were changed for production behavior beyond the test-only mock alignment required for accurate validation. The work stayed within preview/test scope and did not relax permissions.
