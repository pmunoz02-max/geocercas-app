# Tracker session recovery — Preview

## Evidence
Connected TECNO CH7n, installed versionCode 14: foreground service alive, but runtime token missing; recovery logs report missing session. Background location is not granted. The available logs do not establish why the token disappeared. No data was erased and no service restart was forced.

## Changes
Web requires token, recipient identity and organization before starting. After 12 seconds without a complete session, it shows an unavailable-session message instead of indefinite initialization. Polling and the native session-ready event still allow late recovery. ES/EN/FR included. No credentials are generated or revived.

Native WebViewActivity skips synchronization into service preferences and WebView when any session field is missing. This prevents an incomplete bootstrap from deleting credentials; it is hardening, not proof of the historical cause. Expiry/revocation checks remain unchanged. Android source is outside Git; the accompanying patch preserves the change and the original is backed up in backup-session-20260921.

## Verification
Four UI tests passed including missing identity and late session recovery. Vite build passed. Native Java/Kotlin release compilation passed. No APK was installed, no Google Play release and no Production promotion occurred.

## Remaining device validation
Recover through the current valid Production invitation; if expired/revoked, use the authorized invitation flow. Verify successful position delivery then background continuity. Native changes require a signed Android update through the existing release process; web deployment alone does not deliver them. Background-location permission must be granted by the user in Android settings. Do not reuse another organization identity, bypass token validation, or claim active based solely on bridge availability.
