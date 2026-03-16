import L from "leaflet";

function toNum(v) {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function isValidLatLng(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function parseMaybeJson(input) {
  if (!input) return null;
  if (typeof input === "object") return input;
  if (typeof input === "string") {
    try {
      return JSON.parse(input);
    } catch {
      return null;
    }
  }
  return null;
}

export function mapTrackerLatestRow(row) {
  if (!row?.user_id) return null;

  const mapped = {
    user_id: String(row.user_id),
    lat: Number(row.lat),
    lng: Number(row.lng),
    accuracy: row.accuracy ?? null,
    recorded_at: row.ts ?? null,
    source: "tracker_latest",
  };

  if (!isValidLatLng(mapped.lat, mapped.lng)) return null;
  return mapped;
}

export function getTrackerKey(row) {
  if (!row) return "unknown";
  return String(row.personal_id || row.user_id || "unknown");
}

export function getPositionTs(row) {
  if (!row) return 0;

  if (row.recorded_at) {
    const ts = Date.parse(row.recorded_at);
    if (Number.isFinite(ts)) return ts;
  }

  if (row.tracker_latest_at) {
    const ts = Date.parse(row.tracker_latest_at);
    if (Number.isFinite(ts)) return ts;
  }

  if (row.position_at) {
    const ts = Date.parse(row.position_at);
    if (Number.isFinite(ts)) return ts;
  }

  if (row.created_at) {
    const ts = Date.parse(row.created_at);
    if (Number.isFinite(ts)) return ts;
  }

  return 0;
}

// GeoJSON is [lng,lat] => Leaflet [lat,lng]
function toLatLngStrict(coord) {
  if (!coord || !Array.isArray(coord) || coord.length < 2) return null;
  const lng = Number(coord[0]);
  const lat = Number(coord[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return [lat, lng];
}

function normalizeGeoJSONToPolygons(input) {
  const polygons = [];
  const obj = parseMaybeJson(input);
  if (!obj) return polygons;

  const pushRing = (ring) => {
    if (!Array.isArray(ring)) return;
    const poly = ring.map(toLatLngStrict).filter(Boolean);
    if (poly.length > 2) polygons.push(poly);
  };

  const handleGeometry = (g) => {
    if (!g || typeof g !== "object") return;
    if (g.type === "Polygon") pushRing(g.coordinates?.[0]);
    else if (g.type === "MultiPolygon") (g.coordinates || []).forEach((poly) => pushRing(poly?.[0]));
  };

  if (obj?.type === "FeatureCollection") {
    (obj.features || []).forEach((f) => handleGeometry(f?.geometry));
    return polygons;
  }
  if (obj?.type === "Feature") {
    handleGeometry(obj.geometry);
    return polygons;
  }
  if (obj?.type) handleGeometry(obj);

  return polygons;
}

export function boundsFromPolys(polys) {
  try {
    const all = [];
    (polys || []).forEach((ring) => (ring || []).forEach((p) => all.push(p)));
    if (all.length < 3) return null;
    const b = L.latLngBounds(all);
    return b.isValid() ? b : null;
  } catch {
    return null;
  }
}

export function isProbablyZeroZeroBounds(b) {
  try {
    if (!b?.isValid?.()) return false;
    const c = b.getCenter();
    const sw = b.getSouthWest();
    const ne = b.getNorthEast();
    const w = Math.abs(ne.lng - sw.lng);
    const h = Math.abs(ne.lat - sw.lat);
    const nearZero = Math.abs(c.lat) < 0.01 && Math.abs(c.lng) < 0.01;
    const tiny = w < 0.01 && h < 0.01;
    return nearZero && tiny;
  } catch {
    return false;
  }
}

export function shouldFitToBounds(map, bounds) {
  try {
    if (!map || !bounds?.isValid?.()) return false;
    const view = map.getBounds?.();
    if (!view?.isValid?.()) return true;
    return !view.intersects(bounds.pad(0.05));
  } catch {
    return true;
  }
}

function pickGeometry(row) {
  return row?.geojson ?? row?.polygon ?? row?.geometry ?? null;
}

function inferCircleFromRow(row) {
  const r = toNum(row?.radius_m);
  const lat = toNum(row?.lat);
  const lng = toNum(row?.lng);
  if (!r || r <= 0) return null;
  if (!isValidLatLng(lat, lng)) return null;
  return { center: [lat, lng], radius_m: r };
}

export function buildGeofenceLayerItems(geofenceRows) {
  const items = [];
  let skipped = 0;

  for (const g of geofenceRows || []) {
    const gj = pickGeometry(g);
    const polys = normalizeGeoJSONToPolygons(gj);

    if (polys.length) {
      const b = boundsFromPolys(polys);
      if (isProbablyZeroZeroBounds(b)) {
        skipped += 1;
      } else {
        polys.forEach((p, idx) =>
          items.push({ type: "polygon", geofenceId: g.id, name: g.name || g.id, positions: p, idx })
        );
      }
    }

    const circle = inferCircleFromRow(g);
    if (circle) {
      items.push({
        type: "circle",
        geofenceId: g.id,
        name: g.name || g.id,
        center: circle.center,
        radius_m: circle.radius_m,
        idx: "c",
      });
    }
  }

  return { items, skipped };
}