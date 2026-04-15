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

    // 🔥 FIX CRÍTICO
    recorded_at:
      row.ts ||
      row.recorded_at ||
      row.device_recorded_at ||
      null,

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

// resto del archivo igual (NO tocar)