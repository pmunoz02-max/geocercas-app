-- Read-only audit, project mujwsfhkocsuuahlrssn, 2026-09-20
SELECT jsonb_build_object(
'columns',(SELECT jsonb_agg(to_jsonb(c)) FROM (SELECT table_name,column_name,data_type,udt_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('plans','org_billing','organizations','play_products','play_purchases','org_entitlements') ORDER BY table_name,ordinal_position)c),
'enums',(SELECT jsonb_agg(e.enumlabel ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid='public.plan_code'::regtype),
'constraints',(SELECT jsonb_agg(jsonb_build_object('table',conrelid::regclass::text,'name',conname,'definition',pg_get_constraintdef(oid))) FROM pg_constraint WHERE conrelid IN ('public.plans'::regclass,'public.org_billing'::regclass,'public.organizations'::regclass,'public.play_products'::regclass) OR confrelid='public.plans'::regclass),
'plans',(SELECT jsonb_agg(to_jsonb(p)) FROM public.plans p),
'functions',(SELECT jsonb_agg(jsonb_build_object('name',p.proname,'identity',p.oid::regprocedure::text)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f' AND (p.prosrc ~* 'plan_code|org_entitlements|org_billing|public.plans')),
'triggers',(SELECT jsonb_agg(pg_get_triggerdef(oid)) FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN ('public.org_billing'::regclass,'public.organizations'::regclass,'public.plans'::regclass)),
'view',(SELECT pg_get_viewdef('public.org_entitlements'::regclass,true))
) AS audit;

