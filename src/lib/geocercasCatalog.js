// Helper para obtener el catálogo de geocercas activas por orgId desde el API canónico
export async function getGeocercasCatalog(orgId) {
  if (!orgId) return [];
  const url = `/api/geofences?action=list&onlyActive=true&org_id=${encodeURIComponent(orgId)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (Array.isArray(data?.items)) return data.items;
    return [];
  } catch (e) {
    console.error("getGeocercasCatalog error", e);
    return [];
  }
}
