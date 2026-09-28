// Explicit backend invocation only. Never schedules itself or targets production.
import fs from 'node:fs';
import { createPreviewHardwareClient } from '../lib/hardware/preview-client.mjs';
import { normalizeObservation } from '../lib/hardware/observation.mjs';
const usage = 'Usage: node scripts/run-hardware-preview.mjs send <batch.json> | purge';
async function main() {
  const [mode, filename, ...extra] = process.argv.slice(2);
  if (extra.length || !['send','purge'].includes(mode) || (mode === 'send' ? !filename : !!filename)) throw new Error(usage);
  const inventory = JSON.parse(fs.readFileSync(new URL('../docs/hardware-foundation-preview-installation.json', import.meta.url), 'utf8').replace(/^\uFEFF/,''));
  if (inventory.project_ref !== 'mujwsfhkocsuuahlrssn' || !inventory.pilot.simulation_only) throw new Error('invalid_pilot_inventory');
  const rpc = createPreviewHardwareClient({ url: process.env.SUPABASE_URL, serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY, enabled: process.env.HARDWARE_PREVIEW_ENABLED });
  if (mode === 'purge') {
    // One bounded pass, has_more tells the operator/scheduler to invoke again.
    const result = await rpc('purge_hardware_observations_preview', { p_org_id: inventory.pilot.org_id, p_batch_size: 1000 });
    console.log(JSON.stringify(result));
    return;
  }
  if (fs.statSync(filename).size > 100000) throw new Error('batch_too_large');
  const batch = JSON.parse(fs.readFileSync(filename,'utf8').replace(/^\uFEFF/,''));
  if (!Array.isArray(batch) || batch.length < 1 || batch.length > 100) throw new Error('invalid_batch');
  const allowed = new Set(inventory.pilot.inventory.map(item => item.device_id));
  // Validate the whole batch before sending any item. Keep original batch for retries.
  const validated = batch.map(item => {
    if (!item || Object.keys(item).some(k => !['device_id','observation'].includes(k)) || !allowed.has(item.device_id)) throw new Error('device_not_in_simulated_pilot');
    return { p_device_id: item.device_id, p_observation: normalizeObservation(item.observation) };
  });
  for (const args of validated) {
    const result = await rpc('ingest_hardware_observation_preview', args);
    if (!['stored','duplicate'].includes(result?.status)) throw new Error('unexpected_ingestion_response');
    console.log(JSON.stringify({ event_id: args.p_observation.event_id, status: result.status }));
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
