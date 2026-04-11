# Tracker Runtime Flow (Preview)

## Canonical runtime flow
1. invite-tracker emite invitación
2. accept-tracker-invite resuelve tracker_user_id
3. accept-tracker-invite genera tracker_access_token runtime
4. backend persiste hash en tracker_runtime_sessions
5. Android/WebView usa tracker_access_token
6. /api/send-position valida hash contra tracker_runtime_sessions
7. backend persiste en positions y tracker_latest

## Source of truth
- runtime auth: tracker_runtime_sessions
- tracker identity: tracker_runtime_sessions.tracker_user_id
- live dashboard: tracker_latest
- canonical history: positions

## Forbidden
- usar owner session para tracking
- usar fallback a auth_token legacy
- resolver identidad tracker desde tracker_invites en send-position
- depender de web session para runtime Android

## Notes
- preview only
- no main
- no production mixing