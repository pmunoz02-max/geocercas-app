const TRACKER_GPS_PREFIX = "/tracker-gps";

export function isTrackerGpsPath(pathname) {
  const p = String(pathname || "").trim().toLowerCase();
  return p === TRACKER_GPS_PREFIX || p.startsWith(`${TRACKER_GPS_PREFIX}/`) || p.startsWith(`${TRACKER_GPS_PREFIX}?`);
}

export function isTrackerCallbackNext(nextPath) {
  return isTrackerGpsPath(String(nextPath || ""));
}
