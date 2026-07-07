# RLS hardening Preview etapa 1

Fecha: 2026-07-07  
Ambiente: Preview  
Proyecto Supabase: pruebatugeo / mujwsfhkocsuuahlrssn

## Motivo

Supabase alertó que existían tablas en el esquema public con Row Level Security desactivado.

Las tablas public son accesibles vía API de Supabase. Si una tabla tiene RLS apagado y permisos para anon/authenticated, puede quedar expuesta a operaciones desde cliente.

## Auditoría inicial Preview

Tablas detectadas con RLS OFF:

- billing_guard_events
- billing_transactions
- billing_trial_identities
- org_billing_backup_2026_04_17
- org_metrics_events
- paddle_webhook_events
- plan_enforcement_deny_log
- plan_enforcement_log
- plan_entitlements
- spatial_ref_sys
- stripe_event_log
- stripe_price_map
- tracker_runtime_sessions

## Corrección aplicada en Preview

Se activó RLS en:

- billing_guard_events
- billing_transactions
- billing_trial_identities
- org_billing_backup_2026_04_17
- org_metrics_events
- paddle_webhook_events
- plan_enforcement_deny_log
- plan_enforcement_log
- plan_entitlements
- stripe_event_log
- stripe_price_map
- tracker_runtime_sessions

## Policy agregada

Tabla:

- org_metrics_events

Policy:

- org_metrics_events_insert_own_ping

Objetivo:

Permitir únicamente a usuarios autenticados insertar su propio evento tracker_active_ping.

Regla:

user_id = auth.uid()
and event_type = 'tracker_active_ping'

## Tablas cerradas sin policies

Las tablas server-only, logs, billing, webhooks y backups quedaron con RLS activo y sin policies frontend.

El acceso desde Edge Functions/API con service_role no debería verse afectado.

## Tabla no tocada

- spatial_ref_sys

Motivo:

Es una tabla especial de PostGIS. No se incluye en la corrección genérica para evitar efectos secundarios.

## Estado final Preview

Después de la corrección, la única tabla public con RLS OFF es:

- spatial_ref_sys

## Producción

No se aplicó todavía en Producción dentro de esta etapa.  
Producción debe auditarse por separado antes de ejecutar SQL correctivo.
