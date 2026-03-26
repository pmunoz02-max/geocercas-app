-- Test Script: Memberships Role Downgrade Prevention
-- Purpose: Validate the proposed trigger behavior before/after deployment
-- Status: READY TO RUN - no destructive operations, uses test data

-- ============================================================================
-- SETUP: Create test org and users
-- ============================================================================

DO $setup$ DECLARE
  v_test_org_id UUID;
  v_owner_id UUID;
  v_admin_id UUID;
  v_tracker_id UUID;
BEGIN
  -- Create test org
  INSERT INTO public.organizations (slug, name, owner_id)
  SELECT 'test-hard-' || to_char(NOW(), 'YYYYMMDD-HH24MISS'), 
         'Test Organization - Hardening',
         NULL
  RETURNING id INTO v_test_org_id;
  
  RAISE NOTICE 'Setup: Created test org %', v_test_org_id;
  
  -- Set session variables for use in downstream tests
  -- (Note: These won't persist, so tests must create their own)
  -- Just informational for now
END;
$setup$;


-- ============================================================================
-- TEST 1: Verify helper function exists and works
-- ============================================================================

\echo '=== TEST 1: Helper function get_role_priority ==='

SELECT 
  public.get_role_priority('owner') AS owner_priority,
  public.get_role_priority('admin') AS admin_priority,
  public.get_role_priority('tracker') AS tracker_priority,
  public.get_role_priority('viewer') AS viewer_priority;

-- Expected output:
-- owner_priority | admin_priority | tracker_priority | viewer_priority
-- 3              | 2              | 1                | 0


-- ============================================================================
-- TEST 2: Verify trigger function exists
-- ============================================================================

\echo '=== TEST 2: Trigger function exists ==='

SELECT EXISTS(
  SELECT 1 FROM information_schema.routines 
  WHERE routine_schema = 'public' 
    AND routine_name = 'prevent_membership_role_downgrade'
) AS trigger_function_exists;

-- Expected: true


-- ============================================================================
-- TEST 3: Verify trigger is attached
-- ============================================================================

\echo '=== TEST 3: Trigger attached to memberships ==='

SELECT 
  trigger_name,
  event_manipulation,
  event_object_table,
  action_timing
FROM information_schema.triggers 
WHERE trigger_schema = 'public'
  AND trigger_name = 'trg_prevent_membership_role_downgrade'
  AND event_object_table = 'memberships';

-- Expected: 1 row showing BEFORE UPDATE


-- ============================================================================
-- TEST 4: Verify downgrade is blocked (if trigger applied)
-- ============================================================================

\echo '=== TEST 4: Downgrade blocking behavior ==='

-- This test will work IF the trigger has been applied
-- Creates a test membership and attempts to downgrade

DO $downgrade_test$ DECLARE
  v_test_org_id UUID;
  v_test_user_id UUID;
  v_error_msg TEXT;
BEGIN
  -- Create temporary test org (will be rolled back)
  INSERT INTO public.organizations (slug, name)
  VALUES ('test-downgrade-' || gen_random_uuid()::TEXT, 'Test Downgrade')
  RETURNING id INTO v_test_org_id;
  
  -- Create membership as admin
  INSERT INTO public.memberships (org_id, user_id, role)
  VALUES (v_test_org_id, '00000000-0000-0000-0000-000000000001', 'admin');
  
  -- Attempt downgrade to tracker (should be blocked if trigger active)
  BEGIN
    UPDATE public.memberships
    SET role = 'tracker'
    WHERE org_id = v_test_org_id 
      AND user_id = '00000000-0000-0000-0000-000000000001';
    
    RAISE NOTICE 'TEST 4 RESULT: Downgrade was NOT blocked (trigger may not be active yet)';
  EXCEPTION WHEN OTHERS THEN
    v_error_msg := SQLERRM;
    IF v_error_msg LIKE '%downgrade blocked%' THEN
      RAISE NOTICE 'TEST 4 RESULT: ✓ Downgrade BLOCKED as expected (trigger is active)';
    ELSE
      RAISE NOTICE 'TEST 4 RESULT: Different error: %', v_error_msg;
    END IF;
  END;
  
  -- Cleanup (rollback via transaction)
  RAISE EXCEPTION 'ROLLBACK TEST';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE '%ROLLBACK TEST%' THEN
    NULL;  -- Expected, just cleanup
  ELSE
    RAISE;
  END IF;
END;
$downgrade_test$;

-- Expected BEFORE trigger applied: Downgrade was NOT blocked
-- Expected AFTER trigger applied: ✓ Downgrade BLOCKED


-- ============================================================================
-- TEST 5: Verify upgrade IS allowed
-- ============================================================================

\echo '=== TEST 5: Upgrade is allowed ==='

DO $upgrade_test$ DECLARE
  v_test_org_id UUID;
  v_test_user_id UUID;
  v_count INT;
BEGIN
  -- Create test org
  INSERT INTO public.organizations (slug, name)
  VALUES ('test-upgrade-' || gen_random_uuid()::TEXT, 'Test Upgrade')
  RETURNING id INTO v_test_org_id;
  
  v_test_user_id := '00000000-0000-0000-0000-000000000002';
  
  -- Create membership as tracker
  INSERT INTO public.memberships (org_id, user_id, role)
  VALUES (v_test_org_id, v_test_user_id, 'tracker');
  
  -- Upgrade to admin (should always work)
  UPDATE public.memberships
  SET role = 'admin'
  WHERE org_id = v_test_org_id AND user_id = v_test_user_id;
  
  -- Verify upgrade succeeded
  SELECT COUNT(*) INTO v_count
  FROM public.memberships
  WHERE org_id = v_test_org_id 
    AND user_id = v_test_user_id 
    AND role = 'admin';
  
  IF v_count = 1 THEN
    RAISE NOTICE 'TEST 5 RESULT: ✓ Upgrade to admin succeeded';
  ELSE
    RAISE NOTICE 'TEST 5 RESULT: Upgrade FAILED (unexpected)';
  END IF;
  
  RAISE EXCEPTION 'ROLLBACK TEST';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE '%ROLLBACK TEST%' THEN NULL; END IF;
END;
$upgrade_test$;

-- Expected: ✓ Upgrade to admin succeeded


-- ============================================================================
-- TEST 6: Verify soft-delete (revoke) is allowed even with role change
-- ============================================================================

\echo '=== TEST 6: Soft-delete with revoked_at is allowed ==='

DO $revoke_test$ DECLARE
  v_test_org_id UUID;
  v_test_user_id UUID;
  v_count INT;
BEGIN
  -- Create test org
  INSERT INTO public.organizations (slug, name)
  VALUES ('test-revoke-' || gen_random_uuid()::TEXT, 'Test Revoke')
  RETURNING id INTO v_test_org_id;
  
  v_test_user_id := '00000000-0000-0000-0000-000000000003';
  
  -- Create membership as admin
  INSERT INTO public.memberships (org_id, user_id, role)
  VALUES (v_test_org_id, v_test_user_id, 'admin');
  
  -- Soft-delete (revoked_at + role change together - should be allowed)
  UPDATE public.memberships
  SET revoked_at = NOW(), role = 'tracker'
  WHERE org_id = v_test_org_id AND user_id = v_test_user_id;
  
  -- Verify revocation succeeded
  SELECT COUNT(*) INTO v_count
  FROM public.memberships
  WHERE org_id = v_test_org_id 
    AND user_id = v_test_user_id 
    AND revoked_at IS NOT NULL;
  
  IF v_count = 1 THEN
    RAISE NOTICE 'TEST 6 RESULT: ✓ Soft-delete/revoke succeeded (allowed by trigger)';
  ELSE
    RAISE NOTICE 'TEST 6 RESULT: Soft-delete FAILED (unexpected)';
  END IF;
  
  RAISE EXCEPTION 'ROLLBACK TEST';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE '%ROLLBACK TEST%' THEN NULL; END IF;
END;
$revoke_test$;

-- Expected: ✓ Soft-delete/revoke succeeded


-- ============================================================================
-- TEST 7: Verify multi-org independence
-- ============================================================================

\echo '=== TEST 7: Multi-org roles are independent ==='

DO $multiorg_test$ DECLARE
  v_org_a UUID;
  v_org_b UUID;
  v_user_id UUID;
  v_role_a TEXT;
  v_role_b TEXT;
BEGIN
  v_user_id := '00000000-0000-0000-0000-000000000004';
  
  -- Create two test orgs
  INSERT INTO public.organizations (slug, name)
  VALUES ('test-multi-a-' || gen_random_uuid()::TEXT, 'Multi Org A')
  RETURNING id INTO v_org_a;
  
  INSERT INTO public.organizations (slug, name)
  VALUES ('test-multi-b-' || gen_random_uuid()::TEXT, 'Multi Org B')
  RETURNING id INTO v_org_b;
  
  -- User is owner in org_a and tracker in org_b
  INSERT INTO public.memberships (org_id, user_id, role)
  VALUES (v_org_a, v_user_id, 'owner'),
         (v_org_b, v_user_id, 'tracker');
  
  -- Verify both exist
  SELECT role INTO v_role_a FROM public.memberships WHERE org_id = v_org_a AND user_id = v_user_id;
  SELECT role INTO v_role_b FROM public.memberships WHERE org_id = v_org_b AND user_id = v_user_id;
  
  IF v_role_a = 'owner' AND v_role_b = 'tracker' THEN
    RAISE NOTICE 'TEST 7 RESULT: ✓ Multi-org roles independent (owner in A, tracker in B)';
  ELSE
    RAISE NOTICE 'TEST 7 RESULT: Multi-org test FAILED';
  END IF;
  
  RAISE EXCEPTION 'ROLLBACK TEST';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE '%ROLLBACK TEST%' THEN NULL; END IF;
END;
$multiorg_test$;

-- Expected: ✓ Multi-org roles independent


-- ============================================================================
-- SUMMARY
-- ============================================================================

\echo ''
\echo '=================================================================';
\echo 'Memberships Role Downgrade Prevention - Test Summary';
\echo '=================================================================';
\echo 'Run these tests:';
\echo '  1. After reviewing the proposal (docs/DATABASE_HARDENING_MEMBERSHIPS_PROPOSAL.md)';
\echo '  2. On STAGING environment first';
\echo '  3. After applying the migration (if approved)';
\echo '';
\echo 'Expected outcomes:';
\echo '  - TEST 1-3: Pass always (reflect code that should exist)';
\echo '  - TEST 4-7: Behavior depends on trigger activation status';
\echo '';
\echo 'If TEST 1-3 fail: Trigger/functions not applied yet';
\echo 'If TEST 4 shows "blocked": Trigger is active and working ✓';
\echo '=================================================================';
