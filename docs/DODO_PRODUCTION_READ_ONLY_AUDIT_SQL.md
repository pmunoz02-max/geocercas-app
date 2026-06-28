# DODO Production Read-Only Audit SQL

Fecha: 28 junio 2026  
Proyecto: App Geocercas / GeoField GPS  
Alcance: SQL read-only para auditar Supabase Production antes de migrar Dodo LIVE.

## 1. Advertencia operativa

Este documento contiene únicamente consultas read-only.

No ejecutar `update`, `insert`, `delete`, `alter`, `drop`, `create`, `grant`, `revoke`, `truncate`, `db push`, `db pull`, `db reset` ni `migration repair` en Production durante esta fase.

No ejecutar contra Production hasta orden expresa.

## 2. Confirmar proyecto activo antes de cualquier auditoría

Antes de correr consultas, confirmar manualmente que el comando apunta al proyecto correcto.

Production esperado:

```text
wpaixkvokdkudymgjoua
```

Preview esperado:

```text
mujwsfhkocsuuahlrssn
```

No usar `supabase link` hacia Production sin orden expresa.

## 3. Auditoría de columnas org_billing

```sql
select
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'org_billing'
order by ordinal_position;
```

## 4. Auditoría de constraints org_billing

```sql
select
  conname,
  pg_get_constraintdef(c.oid) as constraint_definition
from pg_constraint c
join pg_class t on t.oid = c.conrelid
join pg_namespace n on n.oid = t.relnamespace
where n.nspname = 'public'
  and t.relname = 'org_billing'
order by conname;
```

## 5. Auditoría de provider actual

```sql
select
  billing_provider,
  plan_code,
  subscribed_plan_code,
  plan_status,
  count(*) as rows
from public.org_billing
group by billing_provider, plan_code, subscribed_plan_code, plan_status
order by rows desc;
```

## 6. Auditoría de columnas Dodo en org_billing

```sql
select
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'org_billing'
  and column_name in (
    'dodo_customer_id',
    'dodo_subscription_id',
    'dodo_product_id',
    'dodo_checkout_session_id',
    'dodo_payment_id',
    'last_dodo_event_at'
  )
order by column_name;
```

## 7. Auditoría tabla dodo_webhook_events

```sql
select
  table_schema,
  table_name,
  table_type
from information_schema.tables
where table_schema = 'public'
  and table_name = 'dodo_webhook_events';
```

## 8. Auditoría columnas dodo_webhook_events

```sql
select
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'dodo_webhook_events'
order by ordinal_position;
```

## 9. Auditoría índices dodo_webhook_events

```sql
select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'dodo_webhook_events'
order by indexname;
```

## 10. Auditoría RLS

```sql
select
  schemaname,
  tablename,
  rowsecurity,
  forcerowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'org_billing',
    'dodo_webhook_events',
    'activities',
    'asignaciones',
    'geofences',
    'personal',
    'tracker_positions'
  )
order by tablename;
```

## 11. Auditoría de policies

```sql
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('org_billing', 'dodo_webhook_events')
order by tablename, policyname;
```

## 12. Auditoría definición org_entitlements

```sql
select
  schemaname,
  viewname,
  definition
from pg_views
where schemaname = 'public'
  and viewname = 'org_entitlements';
```

## 13. Auditoría definición v_billing_panel

```sql
select
  schemaname,
  viewname,
  definition
from pg_views
where schemaname = 'public'
  and viewname = 'v_billing_panel';
```

## 14. Auditoría plan_limits

```sql
select
  *
from public.plan_limits
order by plan;
```

## 15. Auditoría org_billing_effective

```sql
select
  table_schema,
  table_name,
  table_type
from information_schema.tables
where table_schema = 'public'
  and table_name = 'org_billing_effective';
```

Si existe como vista:

```sql
select
  schemaname,
  viewname,
  definition
from pg_views
where schemaname = 'public'
  and viewname = 'org_billing_effective';
```

## 16. Auditoría de datos Dodo existentes en Production

```sql
select
  org_id,
  plan_code,
  subscribed_plan_code,
  plan_status,
  billing_provider,
  dodo_customer_id,
  dodo_subscription_id,
  dodo_product_id,
  current_period_end,
  updated_at
from public.org_billing
where billing_provider = 'dodo'
   or dodo_customer_id is not null
   or dodo_subscription_id is not null
   or dodo_product_id is not null
order by updated_at desc nulls last;
```

## 17. Auditoría de funciones desde CLI

Cuando se autorice revisar Production, listar funciones con project ref explícito:

```powershell
supabase functions list --project-ref wpaixkvokdkudymgjoua
```

No desplegar funciones en esta fase.

## 18. Auditoría de secrets

No imprimir ni pegar valores de secrets.

La verificación debe hacerse solo como checklist visual en Supabase o con comandos que no expongan valores.

Secrets esperados:

```text
DODO_API_KEY_LIVE
DODO_PRODUCT_ID_PRO_LIVE
DODO_PRODUCT_ID_ENTERPRISE_LIVE
DODO_WEBHOOK_SECRET_LIVE
DODO_APP_BASE_URL
DODO_RETURN_URL_LIVE
DODO_CANCEL_URL_LIVE
```

## 19. Resultado esperado de esta auditoría

Al terminar la auditoría read-only se debe producir:

```text
1. Lista de diferencias Preview vs Production.
2. SQL Production exacto, si hace falta.
3. Lista de secrets LIVE pendientes.
4. Lista de funciones a desplegar.
5. Riesgos detectados antes de tocar Production.
```

## 20. Estado

Documento preparado.  
No ejecutado en Production.  
No autoriza cambios.  
No autoriza Promote.
