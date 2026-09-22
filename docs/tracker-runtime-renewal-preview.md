# Runtime renewal — Preview, 2026-09-22

## Scope
Backend migration and HTTP endpoint for all enrolled tracker sessions, not a user-specific repair. Production is unchanged. Android integration compiled locally; it is NOT yet distributed or validated on a physical Preview install. A web Promote alone cannot deliver this native feature.

## Contract
POST /api/tracker-session-renew with refresh_token (client-generated 32 random bytes encoded as hex), request_id (UUID persisted until success), org_id and tracker_user_id. Enrollment additionally requires the still-valid access bearer. After enrollment the separate refresh proof permits recovery when the daily access expires. Only hashes are stored on the server. The backend derives a deterministic opaque access token from the refresh secret and request id, so repeating a request after losing its response returns the same credential. Credentials must never be logged.

The database locks the session row, verifies active/nonrevoked session, exact organization and identity, active tracker membership, plan state and positive entitlement. It never creates memberships, consumes additional seats or alters another organization's roles. The RPC is executable only by service_role. Runtime table access is backend-only with RLS enabled.

Access lasts 24 hours; Android renews an hour before expiry when processing positions. Refresh lasts 30 days since the last successful rotation. This supports recurring automatic renewal, not eternal authorization: revoked sessions and more than 30 days offline require authorized reactivation. Sessions already erased or expired before enrollment cannot be safely upgraded without a valid invitation.

HTTP: 200 renewed, 400 malformed, 403 not renewable, 409 pending request expired (retry with new request id, same proof), 503 temporary failure (retain credentials and request id). No owner Auth tokens or org-only identity fallback.

## Android
RuntimeSessionRenewal.kt persists refresh proof and request id BEFORE HTTP, commits the complete returned access to all runtime aliases, retains credentials on network failure, checks identity/session still match after HTTP and ignores a stale original WebView token once enrolled. Foreground sender performs network work off the UI thread. Existing queue and user stop behavior are retained. Integration source and patches are under docs/android-patches/runtime-renewal; local Android tree is outside Git. These patches include the prior incomplete-session protection and should be reviewed/applied against the release source, not blindly applied twice.

## Verification and deployment
Migration applied only to Supabase Preview mujwsfhkocsuuahlrssn using apply_migration. SQL assertions ran successfully before and after application with ROLLBACK: enrollment, retry without double rotation, expired access recovery, wrong org/user, zero limit, inactive plan, revoked membership/session, expired refresh, unchanged membership count, RPC privilege rejection. No fixture data retained.
Local HTTP/UI tests cover rejection and recovery; Android Java/Kotlin compilation is checked separately. Physical offline/restart/expiry and concurrent two-device behavior are still release gates, not claimed as passed. Do not Promote this bundle to Production until the Android Preview build has been installed and these checks pass. Android background-location permission and device battery restrictions still require device configuration; software cannot guarantee connectivity when the OS or user stops tracking.

Order: Preview migration -> Preview backend -> signed Preview Android with Preview-only URLs -> device validation -> separately authorized Production rollout and Play distribution. Existing installed v14 has no automatic renewal.
