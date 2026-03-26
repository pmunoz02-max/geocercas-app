# Auth Session Isolation (Preview)

## Alcance

Este documento describe el aislamiento entre el flujo principal y el flujo tracker en preview.

## Reglas activas

- El flujo tracker usa cliente Supabase aislado (`supabaseTracker`) y no reutiliza el cliente principal.
- En callback tracker (`next` hacia rutas tracker), `verifyOtp`, `exchangeCodeForSession` y `setSession` corren sobre `supabaseTracker`.
- En callback tracker no se ejecuta bootstrap de cookies de sesión principal (`tg_at`/`tg_rt`).
- `TrackerGpsPage` usa únicamente cliente tracker (`PRIMARY = supabaseTracker`) para sesión, membership check y llamadas protegidas.

## Implementación de referencia

- `src/pages/AuthCallback.tsx`
- `src/pages/TrackerGpsPage.jsx`
- `src/lib/supabaseTrackerClient.js`
- `src/lib/trackerFlow.js`

## Efecto operativo

- Los callbacks tracker no pisan ni hidratan la sesión principal del owner/admin.
- El flujo tracker mantiene su sesión separada durante onboarding, aceptación y envío de posición.