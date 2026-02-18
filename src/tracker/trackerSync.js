// src/tracker/trackerSync.js
// Lógica para insertar directo en Supabase y, si falla (offline / red), encolar.
// Incluye flush en lotes y reintentos exponenciales.
// CANÓNICO: tracker_positions

import {
  enqueuePosition,
  peekBatch,
  removeByIds,
  updateRetry,
  countQueued,
} from "./offlineQueue";

// Helper: espera (ms)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createTrackerSync({
  supabase,
  tableName = "tracker_positions",
  batchSize = 100,
  maxRetries = 6,
} = {}) {
  let flushing = false;
  let backoffMs = 1000; // 1s inicial para reintento manual (online event)

  async function directInsert(row) {
    const { error } = await supabase.from(tableName).insert(row);
    if (error) throw error;
  }

  async function directBatchInsert(rows) {
    if (!rows?.length) return;
    const { error } = await supabase.from(tableName).insert(rows);
    if (error) throw error;
  }

  // Llama esto para registrar una posición:
  // - si online e insert OK -> listo
  // - si falla o estás offline -> en cola
  async function recordPosition(row) {
    try {
      if (!navigator.onLine) throw new Error("offline");
      await directInsert(row);
    } catch (e) {
      await enqueuePosition({ ...row, _lastError: e?.message || String(e) });
    }
  }

  // Drena la cola en lotes.
  async function flushQueue({ force = false } = {}) {
    if (flushing) return;
    flushing = true;

    try {
      let more = true;
      while (more) {
        const batch = await peekBatch(batchSize);
        if (!batch.length) {
          more = false;
          break;
        }

        const rows = batch.map(({ id, _retries, _lastError, ...rest }) => rest);

        try {
          await directBatchInsert(rows);
          const ids = batch.map((b) => b.id);
          await removeByIds(ids);
          backoffMs = 1000;
        } catch (err) {
          const msg = err?.message || String(err);
          await updateRetry(batch, msg);

          if (!navigator.onLine) break;

          backoffMs = Math.min(backoffMs * 2, 60_000);
          const maxed = batch.some((b) => (b._retries || 0) >= maxRetries);

          await sleep(backoffMs);

          if (maxed && !force) break;
          break;
        }
      }
    } finally {
      flushing = false;
    }
  }

  async function getQueueCount() {
    return countQueued();
  }

  function attachOnlineListener() {
    window.addEventListener("online", () => {
      flushQueue().catch(console.error);
    });
  }

  function startPeriodicFlush(intervalMs = 60_000) {
    setInterval(() => {
      if (navigator.onLine) {
        flushQueue().catch(() => {});
      }
    }, intervalMs);
  }

  return {
    recordPosition,
    flushQueue,
    getQueueCount,
    attachOnlineListener,
    startPeriodicFlush,
  };
}
