// src/lib/offlineQueue.js
// Cola offline simple para marcajes usando IndexedDB (sin dependencias).
// Store: geocercas-queue / marks

const DB_NAME = "geocercas-queue";
const DB_VERSION = 1;
const STORE = "marks";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (ev) => {
      const db = ev.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, {
          keyPath: "_id",
          autoIncrement: true,
        });
        store.createIndex("by_ts", "_ts");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore(mode, cb) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    const result = cb(store);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
  });
}

export async function queueMark(payload) {
  const doc = { ...payload, _ts: Date.now() };
  await withStore("readwrite", (store) => store.add(doc));
  return true;
}

export async function readAll() {
  return await withStore("readonly", (store) => {
    return new Promise((resolve) => {
      const out = [];
      const req = store.index("by_ts").openCursor();
      req.onsuccess = (ev) => {
        const cursor = ev.target.result;
        if (cursor) {
          out.push(cursor.value);
          cursor.continue();
        } else resolve(out);
      };
    });
  });
}

export async function deleteByIds(ids = []) {
  if (!ids.length) return;
  await withStore("readwrite", (store) => {
    ids.forEach((id) => store.delete(id));
  });
}

export async function flushQueue(supabase) {
  const items = await readAll();
  if (!items.length) return { sent: 0, total: 0 };
  const okIds = [];

  for (const it of items) {
    try {
      // Enviamos tal cual lo que guardamos; created_at ya venía seteado.
      const { error } = await supabase.from("attendances").insert({
        email: it.email,
        role: it.role,
        type: it.type,
        lat: it.lat,
        lng: it.lng,
        accuracy_m: it.accuracy_m,
        inside_geofence: it.inside_geofence,
        distance_m: it.distance_m,
        geofence_name: it.geofence_name,
        created_at: it.created_at,
      });
      if (!error) okIds.push(it._id);
    } catch (_) {
      // Mantener en cola si falla
    }
  }

  await deleteByIds(okIds);
  return { sent: okIds.length, total: items.length };
}
