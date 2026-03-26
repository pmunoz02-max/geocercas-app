// Helper universal para payloads multi-tenant
// Siempre incluye org_id explícito si se provee

export function withActiveOrg(payload, orgId) {
  return {
    ...(payload || {}),
    ...(orgId ? { org_id: String(orgId) } : {}),
  };
}
