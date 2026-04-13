// Helper universal backend para extraer requestedOrgId de payload o query
// Compatible con todos los endpoints /api/*

export function extractRequestedOrgId({ payload = null, query = null } = {}) {
  return (
    payload?.org_id ||
    payload?.orgId ||
    query?.org_id ||
    query?.orgId ||
    null
  );
}
