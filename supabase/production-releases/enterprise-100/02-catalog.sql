-- Target ONLY wpaixkvokdkudymgjoua. Run after the enum transaction commits.
BEGIN;
SET LOCAL lock_timeout = '5s';
INSERT INTO public.plans(code,name,geofence_limit,tracker_limit,price_month_usd)
VALUES ('enterprise_100','ENTERPRISE 100',250,100,169)
ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name,geofence_limit=EXCLUDED.geofence_limit,
tracker_limit=EXCLUDED.tracker_limit,price_month_usd=EXCLUDED.price_month_usd;
CREATE OR REPLACE FUNCTION public.sync_organization_plan_from_org_billing()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  if new.plan_code is null or not exists (
    select 1 from public.plans p where p.code::text = new.plan_code
  ) then
    raise exception 'Invalid billing plan_code for organization sync: %', new.plan_code;
  end if;
  update public.organizations set plan = new.plan_code::public.plan_code
  where id = new.org_id and plan is distinct from new.plan_code::public.plan_code;
  if not found and not exists (select 1 from public.organizations where id = new.org_id) then
    raise exception 'Organization not found for billing sync: %', new.org_id;
  end if;
  return new;
end;
$function$;
DO $verify$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.plans WHERE code::text='enterprise_100'
 AND tracker_limit=100 AND geofence_limit=250 AND price_month_usd=169) THEN
 RAISE EXCEPTION 'ENTERPRISE 100 catalog validation failed'; END IF;
END $verify$;
COMMIT;
