// src/tracker/offlineQueue.js
// Cola minimalista en IndexedDB para posiciones de tracker.
// No dependencias externas.

const DB_NAME = "tracker-offline-db";
const STORE = "positions";
const DB_VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
        store.createIndex("by_ts", "created_at");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    const req = fn(store);
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// Guarda una posición (si estás offline o si el insert falló)
export async function enqueuePosition(pos) {
  // pos: { tracker_id, org_id, geofence_id?, lat, lng, accuracy?, speed?, heading?, battery?, provider?, created_at? }
  const payload = {
    ...pos,
    created_at: pos.created_at || new Date().toISOString(),
    _retries: pos._retries || 0,
    _lastError: pos._lastError || null,
  };
  return withStore("readwrite", (store) => store.add(payload));
}

// Obtiene las primeras N (para enviar en lotes)
export async function peekBatch(limit = 100) {
  const items = [];
  return withStore("readonly", (store) => {
    const idx = store.index("by_ts");
    const req = idx.openCursor();
    req.onsuccess = () => {
      const cur = req.result;
      if (cur && items.length < limit) {
        items.push(cur.value);
        cur.continue();
      }
    };
    return req;
  }).then(() => items);
}

export async function removeByIds(ids) {
  return withStore("readwrite", (store) => {
    ids.forEach((id) => store.delete(id));
    return null;
  });
}

export async function updateRetry(items, lastError) {
  return withStore("readwrite", (store) => {
    items.forEach((it) => {
      const next = { ...it, _retries: (it._retries || 0) + 1, _lastError: lastError || "unknown" };
      store.put(next);
    });
    return null;
  });
}

export async function countQueued() {
  return withStore("readonly", (store) => store.count());
}
