// Backend-only client. Never import into browser code or accept these settings from packets.
const PREVIEW = 'https://mujwsfhkocsuuahlrssn.supabase.co';
export function createPreviewHardwareClient({ url, serviceKey, enabled, fetchImpl = fetch }) {
  if (url !== PREVIEW || enabled !== 'true' || typeof serviceKey !== 'string' || serviceKey.trim().length < 20) throw new Error('hardware_preview_configuration_required');
  return async function rpc(name, args) {
    if (!['ingest_hardware_observation_preview', 'purge_hardware_observations_preview'].includes(name)) throw new Error('hardware_rpc_not_allowed');
    let response;
    try {
      response = await fetchImpl(PREVIEW + '/rest/v1/rpc/' + name, {
        method: 'POST', headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(args), signal: AbortSignal.timeout(15000), redirect: 'error'
      });
    } catch { throw new Error('hardware_transport_failed_retry_same_event'); }
    if (!response.ok) {
      // No arbitrary server response/token/coordinates in console output.
      throw new Error('hardware_rpc_http_' + response.status);
    }
    return response.json();
  };
}
