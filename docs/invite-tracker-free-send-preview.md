# Corrección del envío de invitaciones FREE — Preview

Fecha: 2026-09-09.

La ruta normal /api/invite-tracker rechazaba FREE por exigir siempre plan_status=active. Ahora admite FREE con estado free/active; los demás planes requieren estado activo normalizado. Exige billing real de la organización solicitada.

El cupo procede de org_entitlements.max_trackers, sin límites legacy ni conversiones: entero no negativo, incluidos overrides 0 y 1. El consumo cuenta memberships de la misma org con role=tracker y revoked_at IS NULL. Datos ausentes o inválidos y errores de conteo bloquean el envío.

Se conservan autenticación, create_pairing_code y el flujo de identidad existente. La aceptación transaccional desplegada en Supabase se documenta por separado; este cambio corresponde al envío servido por Vercel.

Validación: 9 pruebas de handler con mocks aprobadas. No se enviaron correos reales durante las pruebas. Comando: node node_modules/vitest/vitest.mjs run src/test/invite-tracker.handler.test.js --pool=forks --environment=node --reporter=dot --no-color --silent.

Publicación autorizada únicamente mediante commit y push a preview. No promover a producción.
