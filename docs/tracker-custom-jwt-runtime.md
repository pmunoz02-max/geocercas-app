## UI readiness rule

El estado `trackerSessionReady` define readiness crítica del tracker bootstrap.

Flags de UX como `batteryPromptDismissed` no deben bloquear el inicio del tracking ni disparar el panel de error crítico.

Separación:
- critical readiness: inviteAccepted, trackerUserId, orgId, trackerSessionReady
- non-critical UX: battery prompts, onboarding hints, bridge guidance