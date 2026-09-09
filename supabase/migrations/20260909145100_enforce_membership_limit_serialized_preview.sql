-- PREVIEW ONLY. Draft: not executed. Requires review and real two-session tests.
BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_membership_limit()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_limit integer;
  v_count bigint;
  v_org uuid;
  v_old_org uuid;
BEGIN
  -- AFTER observes the actual INSERT/UPDATE, including ON CONFLICT's chosen path.
  IF NEW.revoked_at IS NOT NULL OR NEW.role::text IS DISTINCT FROM 'tracker' THEN
    RETURN NEW;
  END IF;
  IF NEW.org_id IS NULL THEN
    RAISE EXCEPTION 'membership_org_required' USING ERRCODE = '23502';
  END IF;
  -- A lock alone cannot refresh a REPEATABLE READ snapshot. Fail closed.
  IF current_setting('transaction_isolation') NOT IN ('read committed', 'read uncommitted') THEN
    RAISE EXCEPTION 'membership_limit_requires_read_committed' USING ERRCODE = '25001';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    v_old_org := OLD.org_id;
  END IF;

  -- NO KEY UPDATE is compatible with FK KEY SHARE locks already held by writers.
  -- For cross-org updates acquire both parent locks in UUID order.
  FOR v_org IN
    SELECT o.id FROM public.organizations o
    WHERE o.id = NEW.org_id OR o.id = v_old_org
    ORDER BY o.id FOR NO KEY UPDATE
  LOOP
    NULL;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = NEW.org_id) THEN
    RAISE EXCEPTION 'membership_org_not_found' USING ERRCODE = '23503';
  END IF;

  -- Stabilize existing billing and plan rows until transaction end.
  PERFORM 1 FROM public.org_billing b
  WHERE b.org_id = NEW.org_id FOR SHARE;
  PERFORM 1 FROM public.plans p
  JOIN public.org_billing b ON p.code::text = b.plan_code
  WHERE b.org_id = NEW.org_id FOR SHARE OF p;

  BEGIN
    SELECT oe.max_trackers INTO STRICT v_limit
    FROM public.org_entitlements oe WHERE oe.org_id = NEW.org_id;
  EXCEPTION
    WHEN no_data_found OR too_many_rows THEN
      RAISE EXCEPTION 'membership_limit_unavailable' USING ERRCODE = 'P0001';
  END;
  -- The verified view column is integer. No text coercion or fallback.
  IF v_limit IS NULL OR v_limit < 0 THEN
    RAISE EXCEPTION 'membership_limit_unavailable' USING ERRCODE = 'P0001';
  END IF;

  -- Separate query AFTER acquiring the lock: fresh snapshot in this VOLATILE
  -- function at READ COMMITTED, including this transaction's written rows.
  SELECT count(*) INTO v_count FROM public.memberships m
  WHERE m.org_id = NEW.org_id
    AND m.revoked_at IS NULL AND m.role::text = 'tracker';
  IF v_count > v_limit THEN
    RAISE EXCEPTION 'Plan limit reached: max trackers = % for org %', v_limit, NEW.org_id
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$function$;

-- Keep every owner and bridge trigger unchanged. Only replace this guard.
DROP TRIGGER IF EXISTS trg_enforce_membership_limit ON public.memberships;
CREATE TRIGGER trg_enforce_membership_limit
AFTER INSERT OR UPDATE OF org_id, revoked_at, user_id, role
ON public.memberships
FOR EACH ROW EXECUTE FUNCTION public.enforce_membership_limit();

COMMIT;
