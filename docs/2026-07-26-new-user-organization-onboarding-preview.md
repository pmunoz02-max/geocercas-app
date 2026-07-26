# Preview: New User Organization Onboarding Fix (2026-07-26)

## Resumen

Se aplicó un ajuste de enrutamiento en Preview para que los usuarios autenticados que todavía no tienen organización sean enviados al flujo de creación de organización, en lugar de volver a Inicio.

## Cambios aplicados

1. App routing
- [src/App.jsx](src/App.jsx): se registró la ruta protegida /onboarding/create-org para habilitar el onboarding de creación de organización.

2. Guard de organización
- [src/components/RequireOrg.jsx](src/components/RequireOrg.jsx): cuando el usuario está autenticado y no tiene organización activa, ahora redirige a /onboarding/create-org.

3. Flujo de onboarding
- La pantalla de onboarding utiliza la RPC create_organization_for_current_user para crear la organización inicial del usuario autenticado.

## Alcance y garantías

- Alcance exclusivo de Preview.
- No se realizaron migraciones SQL para este arreglo.
- No se hicieron cambios en Producción.
- Se mantiene intacto el flujo de invitaciones (tracker/admin); este ajuste solo cubre el caso de usuario autenticado sin organizaciones.
