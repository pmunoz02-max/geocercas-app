-- Operational provisioning, Preview only; run after verifying the target project.
-- Existing same-name job must be inspected before re-running (cron.schedule replaces it).
SELECT cron.schedule('hardware-pilot-retention-preview','*/15 * * * *',$job$
SET statement_timeout='30s'; SET lock_timeout='5s';
SELECT public.purge_hardware_observations_preview(o.id,10000)
FROM public.organizations o JOIN public.org_hardware_entitlements e ON e.org_id=o.id
WHERE o.slug='geofield-hardware-simulator-preview' AND e.simulation_only;
$job$);
