export function normalizeAssignmentStatus(value) {
  return String(value || "").trim().toLowerCase();
}

export function isActiveAssignment(row, now = new Date()) {
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
