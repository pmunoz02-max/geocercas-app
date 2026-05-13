export const config = { runtime: "nodejs" };

import crypto from "node:crypto";

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;

const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

function getHeader(req, name) {
  const value = req.headers?.[name.toLowerCase()] || req.headers?.[name];
  return Array.isArray(value) ? value[0] : value;
}

async function readBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function resolveRuntimeSession(token) {
  if (!token || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;

  const baseUrl = SUPABASE_URL.replace(/\/$/, "");
  const accessTokenHash = sha256Hex(token);
  const url = `${baseUrl}/rest/v1/tracker_runtime_sessions?select=*&access_token_hash=eq.${accessTokenHash}&active=eq.true&limit=1`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.warn("[api/send-position] runtime_session_lookup_not_ok", {
        status: response.status,
        body: text?.slice?.(0, 300),
      });
      return null;
    }

    const rows = await response.json();

    if (Array.isArray(rows) && rows.length > 0) {
      const session = rows[0];

      const patchUrl = `${baseUrl}/rest/v1/tracker_runtime_sessions?id=eq.${session.id}`;
      await fetch(patchUrl, {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          last_seen_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      });

      return session;
    }
  } catch (error) {
    console.warn("[api/send-position] runtime_session_lookup_error", {
      error: String(error?.message || error),
    });
  }

  return null;
}

function supabaseRestHeaders() {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    Accept: "application/json",
  };
}

async function fetchSupabaseRows(queryPath, logLabel) {
  const baseUrl = SUPABASE_URL.replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/rest/v1/${queryPath}`, {
    method: "GET",
    headers: supabaseRestHeaders(),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error("[api/send-position] supabase_lookup_failed", {
      lookup: logLabel,
      status: response.status,
      body: body?.slice?.(0, 300),
    });
    throw new Error(`${logLabel}_lookup_failed`);
  }

  const rows = await response.json();
  return Array.isArray(rows) ? rows : [];
}

function uniq(values = []) {
  return Array.from(
    new Set(
      values
        .filter(Boolean)
        .map((value) => String(value).trim())
        .filter(Boolean)
    )
  );
}

function normalizeAssignmentStatus(value) {
  return String(value || "").trim().toLowerCase();
}

function isActiveAssignment(row, now = new Date()) {
  if (!row || row.is_deleted === true) return false;

  const status = normalizeAssignmentStatus(row.status || row.estado);
  if (
    status &&
    !["active", "activa", "activo", "enabled", "vigente"].includes(status)
  ) {
    return false;
  }

  const nowMs = now.getTime();

  if (row.start_time) {
    const startTimeMs = Date.parse(row.start_time);
    if (Number.isFinite(startTimeMs) && startTimeMs > nowMs) return false;
  }

  if (row.end_time) {
    const endTimeMs = Date.parse(row.end_time);
    if (Number.isFinite(endTimeMs) && endTimeMs < nowMs) return false;
  }

  const todayIso = now.toISOString().slice(0, 10);
  if (row.start_date && String(row.start_date).slice(0, 10) > todayIso) return false;
  if (row.end_date && String(row.end_date).slice(0, 10) < todayIso) return false;

  return true;
}

async function resolvePersonalIdForTracker({ orgId, userId }) {
  const params = new URLSearchParams({
    select: "id",
    org_id: `eq.${orgId}`,
    user_id: `eq.${userId}`,
    limit: "1",
  });

  const rows = await fetchSupabaseRows(`personal?${params.toString()}`, "personal");
  return rows?.[0]?.id ? String(rows[0].id) : null;
}

async function loadActiveAssignments({ orgId, userId }) {
  const personalId = await resolvePersonalIdForTracker({ orgId, userId });

  const params = new URLSearchParams({
    select:
      "id,org_id,user_id,personal_id,geofence_id,geocerca_id,status,estado,is_deleted,start_time,end_time,start_date,end_date",
    org_id: `eq.${orgId}`,
  });

  if (personalId) {
    params.set("or", `(user_id.eq.${userId},personal_id.eq.${personalId})`);
  } else {
    params.set("user_id", `eq.${userId}`);
  }

  const rows = await fetchSupabaseRows(`asignaciones?${params.toString()}`, "assignments");
  return rows.filter((row) => isActiveAssignment(row));
}

async function loadAssignedActiveGeofences({ orgId, assignments }) {
  const geofenceIds = uniq(assignments.map((row) => row.geofence_id));
  const sourceGeocercaIds = uniq(assignments.map((row) => row.geocerca_id));
  const rows = [];

  if (geofenceIds.length > 0) {
    const params = new URLSearchParams({
      select:
        "id,org_id,name,geojson,polygon_geojson,lat,lng,radius_m,active,source_geocerca_id",
      org_id: `eq.${orgId}`,
      active: "eq.true",
      id: `in.(${geofenceIds.join(",")})`,
    });

    rows.push(...(await fetchSupabaseRows(`geofences?${params.toString()}`, "geofences_by_id")));
  }

  if (sourceGeocercaIds.length > 0) {
    const params = new URLSearchParams({
      select:
        "id,org_id,name,geojson,polygon_geojson,lat,lng,radius_m,active,source_geocerca_id",
      org_id: `eq.${orgId}`,
      active: "eq.true",
      source_geocerca_id: `in.(${sourceGeocercaIds.join(",")})`,
    });

    rows.push(...(await fetchSupabaseRows(`geofences?${params.toString()}`, "geofences_by_source")));
  }

  const seen = new Set();
  return rows.filter((row) => {
    const id = row?.id ? String(row.id) : null;
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function haversineDistanceMeters(lat1, lng1, lat2, lng2) {
  const toRad = (value) => (Number(value) * Math.PI) / 180;
  const earthRadiusM = 6371000;
  const dLat = toRad(lat2) - toRad(lat1);
  const dLng = toRad(lng2) - toRad(lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusM * Math.asin(Math.sqrt(a));
}

function isPointInsideCircle({ lat, lng, geofence }) {
  if (
    !isFiniteNumber(lat) ||
    !isFiniteNumber(lng) ||
    !isFiniteNumber(geofence?.lat) ||
    !isFiniteNumber(geofence?.lng) ||
    !isFiniteNumber(geofence?.radius_m)
  ) {
    return false;
  }

  const radiusM = Number(geofence.radius_m);
  if (radiusM <= 0) return false;

  const distanceM = haversineDistanceMeters(
    Number(lat),
    Number(lng),
    Number(geofence.lat),
    Number(geofence.lng)
  );

  return distanceM <= radiusM;
}

function parseGeoJsonMaybe(value) {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value;
}

function pointInRing({ lng, lat, ring }) {
  if (!Array.isArray(ring) || ring.length < 3) return false;

  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const current = ring[i];
    const previous = ring[j];
    if (!Array.isArray(current) || !Array.isArray(previous)) continue;

    const xi = Number(current[0]);
    const yi = Number(current[1]);
    const xj = Number(previous[0]);
    const yj = Number(previous[1]);

    if (![xi, yi, xj, yj].every(Number.isFinite)) continue;

    const intersects =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / ((yj - yi) || Number.EPSILON) + xi;

    if (intersects) inside = !inside;
  }

  return inside;
}

function pointInPolygonCoordinates({ lng, lat, rings }) {
  if (!Array.isArray(rings) || rings.length === 0) return false;
  if (!pointInRing({ lng, lat, ring: rings[0] })) return false;

  for (let i = 1; i < rings.length; i += 1) {
    if (pointInRing({ lng, lat, ring: rings[i] })) return false;
  }

  return true;
}

function collectGeoJsonGeometries(value, geometries = []) {
  const parsed = parseGeoJsonMaybe(value);
  if (!parsed || typeof parsed !== "object") return geometries;

  if (parsed.type === "FeatureCollection" && Array.isArray(parsed.features)) {
    for (const feature of parsed.features) {
      collectGeoJsonGeometries(feature, geometries);
    }
    return geometries;
  }

  if (parsed.type === "Feature" && parsed.geometry) {
    collectGeoJsonGeometries(parsed.geometry, geometries);
    return geometries;
  }

  if (parsed.type === "GeometryCollection" && Array.isArray(parsed.geometries)) {
    for (const geometry of parsed.geometries) {
      collectGeoJsonGeometries(geometry, geometries);
    }
    return geometries;
  }

  if (parsed.type === "Polygon" || parsed.type === "MultiPolygon") {
    geometries.push(parsed);
  }

  return geometries;
}

function isPointInsideGeoJson({ lat, lng, geojson }) {
  if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) return false;

  const geometries = collectGeoJsonGeometries(geojson);
  for (const geometry of geometries) {
    if (geometry.type === "Polygon") {
      if (
        pointInPolygonCoordinates({
          lng: Number(lng),
          lat: Number(lat),
          rings: geometry.coordinates,
        })
      ) {
        return true;
      }
    }

    if (geometry.type === "MultiPolygon" && Array.isArray(geometry.coordinates)) {
      for (const rings of geometry.coordinates) {
        if (
          pointInPolygonCoordinates({
            lng: Number(lng),
            lat: Number(lat),
            rings,
          })
        ) {
          return true;
        }
      }
    }
  }

  return false;
}

function isPointInsideGeofence({ lat, lng, geofence }) {
  if (isPointInsideCircle({ lat, lng, geofence })) return true;

  return (
    isPointInsideGeoJson({ lat, lng, geojson: geofence?.geojson }) ||
    isPointInsideGeoJson({ lat, lng, geojson: geofence?.polygon_geojson })
  );
}

async function assertPositionInsideAssignedGeofence({ orgId, userId, lat, lng }) {
  const assignments = await loadActiveAssignments({ orgId, userId });

  if (!assignments.length) {
    return {
      allowed: false,
      reason: "no_active_geofence_assignment",
      assignmentsChecked: 0,
      geofencesChecked: 0,
    };
  }

  const geofences = await loadAssignedActiveGeofences({ orgId, assignments });

  if (!geofences.length) {
    return {
      allowed: false,
      reason: "no_active_assigned_geofence",
      assignmentsChecked: assignments.length,
      geofencesChecked: 0,
    };
  }

  const insideAnyAssignedGeofence = geofences.some((geofence) =>
    isPointInsideGeofence({ lat, lng, geofence })
  );

  return {
    allowed: insideAnyAssignedGeofence,
    reason: insideAnyAssignedGeofence ? null : "outside_assigned_geofence",
    assignmentsChecked: assignments.length,
    geofencesChecked: geofences.length,
  };
}
export default async function handler(req, res) {
  console.log("[api/send-position] proxy_start", {
    method: req.method,
    hasAuth: !!getHeader(req, "authorization"),
  });

  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "method_not_allowed" });
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ ok: false, error: "missing_supabase_env" });
    }

    const authHeader = getHeader(req, "authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ ok: false, error: "missing_bearer_token" });
    }


    const runtimeToken = authHeader.replace("Bearer ", "").trim();
    const runtimeTokenHashPrefix = sha256Hex(runtimeToken).slice(0, 12);
    const body = await readBody(req);

    const session = await resolveRuntimeSession(runtimeToken);

    // Exigir sesión runtime válida y usar solo session.tracker_user_id y session.org_id
    if (!session?.tracker_user_id || !session?.org_id) {
      return res.status(401).json({
        ok: false,
        error: "invalid_runtime_session",
      });
    }

    const userId = session.tracker_user_id;
    const orgId = session.org_id;

    const lat = body.lat ?? body.latitude;
    const lng = body.lng ?? body.longitude;

    if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) {
      return res.status(400).json({ ok: false, error: "invalid_coordinates" });
    }

    const geofenceGate = await assertPositionInsideAssignedGeofence({
      orgId,
      userId,
      lat: Number(lat),
      lng: Number(lng),
    });

    if (!geofenceGate.allowed) {
      console.log("[api/send-position] position_not_stored", {
        reason: geofenceGate.reason,
        assignments_checked: geofenceGate.assignmentsChecked,
        geofences_checked: geofenceGate.geofencesChecked,
        runtime_token_hash_prefix: runtimeTokenHashPrefix,
      });

      return res.status(200).json({
        ok: true,
        stored: false,
        reason: geofenceGate.reason,
      });
    }

    // Insert directo a tracker_positions solo cuando el punto está dentro de una geocerca asignada activa
    const insertPayload = {
      org_id: orgId,
      user_id: userId,
      lat: Number(lat),
      lng: Number(lng),
      accuracy: body.accuracy == null ? null : Number(body.accuracy),
      recorded_at:
        body.recorded_at ||
        body.recordedAt ||
        body.timestamp ||
        new Date().toISOString(),
      source: body.source || "tracker-native-android",
      created_at: new Date().toISOString(),
    };

    const supabaseUrl = SUPABASE_URL.replace(/\/$/, "");
    const insertUrl = `${supabaseUrl}/rest/v1/tracker_positions`;

    const insertResponse = await fetch(insertUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: "return=representation",
      },
      body: JSON.stringify([insertPayload]),
    });

    const responseText = await insertResponse.text();
    let responseJson;
    try {
      responseJson = JSON.parse(responseText);
    } catch {
      responseJson = { raw: responseText };
    }

    let positionId = null;
    if (Array.isArray(responseJson) && responseJson.length > 0 && responseJson[0].id) {
      positionId = responseJson[0].id;
    }

    console.log("[api/send-position] insert_end", {
      insert_table: "tracker_positions",
      position_id: positionId,
      status: insertResponse.status,
      ok: insertResponse.ok,
    });

    if (insertResponse.ok && positionId) {
      return res.status(200).json({ ok: true });
    }

    // Log seguro de error
    console.error("[api/send-position] tracker_position_insert_failed", {
      insert_table: "tracker_positions",
      status: insertResponse.status,
      body: Array.isArray(responseJson) ? responseJson : (typeof responseJson === 'object' ? JSON.stringify(responseJson).slice(0, 300) : String(responseJson).slice(0, 300)),
    });
    return res.status(500).json({ ok: false, error: "tracker_position_insert_failed" });
  } catch (error) {
    console.error("[api/send-position] fatal", error);
    return res.status(500).json({
      ok: false,
      error: "send_position_proxy_failed",
      detail: String(error?.message || error),
    });
  }
}