-- PREVIEW ONLY: transactional integration verification; leaves no test data.
BEGIN;
DO $test$
DECLARE v_org uuid; v_ent public.plan_entitlements; v_blocked boolean;
BEGIN
 SELECT org_id INTO STRICT v_org FROM public.org_billing ORDER BY org_id LIMIT 1;
 UPDATE public.org_billing SET plan_code='enterprise_100',subscribed_plan_code='enterprise_100',plan_status='active',tracker_limit_override=NULL WHERE org_id=v_org;
 IF (SELECT plan::text FROM public.organizations WHERE id=v_org) <> 'enterprise_100' THEN RAISE EXCEPTION 'Legacy sync failed'; END IF;
 v_ent := public.get_plan_entitlements(v_org);
 IF v_ent.max_trackers <> 100 OR v_ent.max_geofences <> 250 THEN RAISE EXCEPTION 'Entitlement mismatch'; END IF;
 PERFORM public.assert_within_plan_limit(v_org,'trackers',99,1,'{}'::jsonb);
 v_blocked:=false;
 BEGIN
 PERFORM public.assert_within_plan_limit(v_org,'trackers',100,1,'{}'::jsonb);
 EXCEPTION WHEN SQLSTATE 'P0001' THEN
 IF SQLERRM NOT LIKE 'Plan limit exceeded for trackers%' THEN RAISE; END IF; v_blocked:=true;
 END;
 IF NOT v_blocked THEN RAISE EXCEPTION '101st tracker not blocked'; END IF;
 PERFORM public.assert_within_plan_limit(v_org,'geofences',249,1,'{}'::jsonb);
 v_blocked:=false;
 BEGIN PERFORM public.assert_within_plan_limit(v_org,'geofences',250,1,'{}'::jsonb);
 EXCEPTION WHEN SQLSTATE 'P0001' THEN
 IF SQLERRM NOT LIKE 'Plan limit exceeded for geofences%' THEN RAISE; END IF; v_blocked:=true;
 END;
 IF NOT v_blocked THEN RAISE EXCEPTION '251st geofence not blocked'; END IF;
 UPDATE public.org_billing SET tracker_limit_override=75 WHERE org_id=v_org;
 IF public.get_max_trackers(v_org) <> 75 THEN RAISE EXCEPTION 'Override failed'; END IF;
 UPDATE public.org_billing SET tracker_limit_override=0 WHERE org_id=v_org;
 IF public.get_max_trackers(v_org) <> 0 THEN RAISE EXCEPTION 'Zero override failed'; END IF;
 IF public.resolve_effective_plan_code('enterprise_100','active') <> 'enterprise_100'
 OR public.resolve_effective_plan_code('enterprise_100','inactive') <> 'free' THEN RAISE EXCEPTION 'Status resolution failed'; END IF;
 INSERT INTO public.play_products(product_id,plan_code,title,active) VALUES ('codex_e100_rollback_test','enterprise_100','Rollback-only test',true);
 INSERT INTO public.play_purchases(org_id,product_id,purchase_token,status,expiry_time)
 VALUES(v_org,'codex_e100_rollback_test','codex_e100_rollback_only','active',now()+interval '1 day');
 IF public.get_best_plan_from_play(v_org)::text <> 'enterprise_100' THEN RAISE EXCEPTION 'Play ranking failed'; END IF;
 UPDATE public.play_purchases SET expiry_time=now()-interval '1 day' WHERE purchase_token='codex_e100_rollback_only';
 IF public.get_best_plan_from_play(v_org)::text = 'enterprise_100' THEN RAISE EXCEPTION 'Expired Play purchase counted'; END IF;
END $test$;
SELECT 'PASS: quotas 100/250, over-limit rejection, legacy sync, overrides 75/0, status resolution, Play active/expired' AS validation;

ROLLBACK;
