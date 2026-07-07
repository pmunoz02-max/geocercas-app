# RLS hardening Production etapa 1

Fecha: 2026-07-07  
Ambiente: Producción  
Proyecto Supabase: My Project / wpaixkvokdkudymgjoua

## Motivo

Supabase alertó que existían tablas en el esquema public con Row Level Security desactivado.

Las tablas public son accesibles vía API de Supabase. Si una tabla tiene RLS apagado y permisos para anon/authenticated, puede quedar expuesta a operaciones desde cliente.

## Auditoría inicial Producción

Tablas detectadas con RLS OFF:

- billing_guard_events
- billing_trial_identities
- paddle_webhook_events
- spatial_ref_sys
- stripe_event_log
- stripe_price_map

## Corrección aplicada en Producción

Se activó RLS en:

- billing_guard_events
- billing_trial_identities
- paddle_webhook_events
- stripe_event_log
- stripe_price_map

## Tabla no tocada

- spatial_ref_sys

Motivo:

Es una tabla especial de PostGIS. No se incluye en la corrección genérica para evitar efectos secundarios.

## Estado final Producción

Después de la corrección, la única tabla public con RLS OFF es:

- spatial_ref_sys

## Nota operativa

La corrección se realizó desde una carpeta temporal separada:

C:\dev\supabase-prod-audit

Esto evitó relinkear el repo principal, que debe permanecer asociado al ambiente Preview.

## Pendiente

Validar flujo funcional en Producción:

- Login.
- Inicio / Dashboard.
- Billing.
- Invitar tracker.
- Aceptar invitación tracker.
- Iniciar seguimiento móvil.
- Ver tracker activo.
