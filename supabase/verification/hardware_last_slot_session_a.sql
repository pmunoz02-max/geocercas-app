-- DRAFT: psql session A, Preview only. Requires committed disposable org configuration
-- enabled=true, max_hardware_trackers=1, simulation_only=true, zero active trackers.
-- -v org_id=<fixture uuid> -v tracker_id=<new deterministic test uuid>
-- Start B while A waits at the prompt. A ROLLBACK means B succeeds.
-- A COMMIT means B must fail with hardware_limit_reached; then cleanup A's exact row.
\set ON_ERROR_STOP on
BEGIN;
SELECT id FROM public.organizations WHERE id=:'org_id'::uuid FOR NO KEY UPDATE;
INSERT INTO public.trackers(id,org_id,name,asset_kind,active)
VALUES(:'tracker_id'::uuid,:'org_id'::uuid,'SIM concurrency A','vehicle',true);
\prompt 'Start session B now. Press Enter once B is waiting: ' proceed
-- Default scenario leaves no tracker data. For the commit scenario replace only
-- this final ROLLBACK with COMMIT, after explicitly authorizing disposable fixtures.
ROLLBACK;
