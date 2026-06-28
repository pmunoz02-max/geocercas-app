-- Read-only verification after production_dodo_schema_migration.sql.

select
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'org_billing'
  and column_name in (
    'dodo_customer_id',
    'dodo_subscription_id',
    'dodo_product_id',
    'dodo_checkout_session_id',
    'dodo_payment_id',
    'last_dodo_event_at',
    'billing_provider'
  )
order by ordinal_position;

select
  conname as constraint_name,
  pg_get_constraintdef(c.oid) as constraint_definition
from pg_constraint c
join pg_class t on t.oid = c.conrelid
join pg_namespace n on n.oid = t.relnamespace
where n.nspname = 'public'
  and t.relname = 'org_billing'
  and conname = 'org_billing_provider_ck';

select
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'dodo_webhook_events'
order by ordinal_position;

select
  n.nspname as schemaname,
  c.relname as tablename,
  c.relrowsecurity as rowsecurity,
  c.relforcerowsecurity as forcerowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'dodo_webhook_events';

select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'dodo_webhook_events'
order by indexname;

select
  definition
from pg_views
where schemaname = 'public'
  and viewname = 'v_billing_panel';
