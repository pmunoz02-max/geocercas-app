-- DRAFT: psql session B, same disposable org_id; different new tracker_id.
-- If A rolls back: insert succeeds, rolled back below.
-- If A commits: exact expected failure 23514 hardware_limit_reached; connection
-- closes due to ON_ERROR_STOP and rolls back B. Verify A active count = 1.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout='60s';
INSERT INTO public.trackers(id,org_id,name,asset_kind,active)
VALUES(:'tracker_id'::uuid,:'org_id'::uuid,'SIM concurrency B','vehicle',true);
ROLLBACK;
