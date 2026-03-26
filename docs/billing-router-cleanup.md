# Billing Router Cleanup

## Contexto
- Existia duplicacion entre src/pages/Billing.jsx y src/app/billing/page.jsx.
- Esto generaba errores inconsistentes y bugs fantasma.

## Decision
- Se elimino src/app/billing.
- Se deja src/pages/Billing.jsx como unica fuente de verdad.

## Data contract
- El frontend usa v_billing_panel como fuente de datos.
- No se agregaron columnas nuevas.
- Se alinearon nombres a:
  - trackers_used
  - geocercas_used
  - active_trackers_24h/7d/30d

## Auth
- La sesion se basa en /api/auth/session.
- Supabase local no es fuente de verdad en produccion.

## Estado
- Validado en preview.
- Listo para promote cuando el resto del flujo este validado.
