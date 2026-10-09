export function completeRuntimeSession(session) {
  return Boolean(session?.runtimeToken && session?.trackerUserId && session?.orgId);
}

// A credential and its identity always come from one source.
export function selectRuntimeSession(fromUrl, fromStorage) {
  if (completeRuntimeSession(fromUrl)) return fromUrl;
  return completeRuntimeSession(fromStorage)
    ? fromStorage
    : { runtimeToken: "", trackerUserId: "", orgId: "" };
}

export function readStoredRuntimeSession(storage) {
  try {
    const token = storage.getItem("tracker_runtime_token") || storage.getItem("tracker_access_token") || "";
    const user = storage.getItem("tracker_user_id") || "";
    const trackerOrg = storage.getItem("tracker_org_id");
    const org = storage.getItem("org_id");
    if (trackerOrg && org && trackerOrg !== org) return null;
    const session = { runtimeToken: token, trackerUserId: user, orgId: trackerOrg || org || "" };
    return completeRuntimeSession(session) ? session : null;
  } catch { return null; }
}
