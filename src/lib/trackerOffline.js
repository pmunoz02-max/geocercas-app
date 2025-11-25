// src/lib/trackerOffline.js
import { upsertPositionCompat } from './trackerApi';

const KEY = 'tracker_pending_positions';

export function enqueuePosition(pos) {
  const list = JSON.parse(localStorage.getItem(KEY) || '[]');
  list.push({
    ...pos,
    at:
      (pos.at instanceof Date ? pos.at.toISOString() : pos.at) ??
      new Date().toISOString(),
  });
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function dequeueAll() {
  const list = JSON.parse(localStorage.getItem(KEY) || '[]');
  localStorage.removeItem(KEY);
  return list;
}

export async function flushPendingPositions() {
  const pending = dequeueAll();
  if (!pending.length) return 0;
  let ok = 0;
  for (const p of pending) {
    try {
      await upsertPositionCompat({
        orgId: p.orgId,
        userId: p.userId,
        personalId: p.personalId ?? null,
        lat: p.lat,
        lng: p.lng,
        accuracy: p.accuracy ?? null,
        speed: p.speed ?? null,
        heading: p.heading ?? null,
        battery: p.battery ?? null,
        at: p.at ? new Date(p.at) : new Date(),
      });
      ok++;
    } catch {
      // si aún falla, re-encolar
      enqueuePosition(p);
    }
  }
  return ok;
}

export function setupOfflineSync() {
  // Reintenta al volver a estar online
  window.addEventListener('online', async () => {
    try {
      const n = await flushPendingPositions();
      if (n > 0) console.log(`[Tracker] reenviadas ${n} posiciones pendientes`);
    } catch (e) {
      console.warn('[Tracker] flushPendingPositions error:', e);
    }
  });
}
