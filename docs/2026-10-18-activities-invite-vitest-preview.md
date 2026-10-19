# Security test coverage and Vitest alignment preview

Date: 2026-10-18

## Scope

This preview note documents the validation work carried out around three related areas:

- security checks for the activities endpoint
- alignment of the invite-tracker mocks with the real Supabase queries
- Vitest discovery/configuration for the project test layout, including the migration of API tests under `src/test/api`

This is a test and validation record only. No backend permissions were relaxed and no production behavior was changed.

## 1) Security tests for activities

The file [src/test/api/actividades.test.js](../src/test/api/actividades.test.js) covers the authorization contract for the activities API.

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

The file [src/test/api/invite-tracker.test.js](../src/test/api/invite-tracker.test.js) initially mocked stale table names and query shapes that did not match the real handler implementation.

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
- `include: ["src/**/*.test.{js,jsx,ts,tsx}"]`

This means the project test layout is now keyed off the source-tree test folder, including the relocated API test files in `src/test/api`.

### Why this mattered

The test migration was necessary because the repo-level `api/` folder is not a valid deploy target for the Vercel Hobby plan and the test files were being treated as deployment-noise rather than as project test assets. Keeping the executable API tests under `src/test/api` avoids the false impression of a deployable `api` test surface while preserving discovery and validation inside the project.

### Recursive count of deployable API test entries

After the move, a recursive count under `api/` returns:

```text
api test files recursive: 0
```

That confirms there are no remaining `.test.js` entries under the deployable `api/` folder, and that the active API tests now live under `src/test/api`.

## 4) Vercel Hobby compatibility note

The earlier issue was not caused by the handler logic itself, but by the repository layout. The Vercel Hobby deployment model does not treat arbitrary files under the repository `api/` folder as a valid deployable application surface when they are test files rather than serverless endpoints. In practice, the presence of test files under `api/` can create confusion during deployment validation and runtime packaging, even when those files are not production handlers.

The fix was therefore to move the test files into the project test tree and keep the deployable runtime surface clean:

- `api/` remains reserved for deployable runtime assets, not test files
- `src/test/api/` holds the API security and contract tests
- Vitest still discovers and runs them normally through the configured file include pattern

## 5) Full-suite validation

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
- the project test layout is aligned with the app’s source tree and the Vercel Hobby constraints
- the repository is in a green state for the current test suite

No code paths were changed for production behavior beyond the test-only mock alignment and the move of the API tests into the project test tree. The work stayed within preview/test scope and did not relax permissions.
