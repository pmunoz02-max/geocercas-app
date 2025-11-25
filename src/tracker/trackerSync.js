// src/tracker/trackerSync.js
// Lógica para insertar directo en Supabase y, si falla (offline / red), encolar.
// Incluye flush en lotes y reintentos exponenciales.

import { enqueuePosition, peekBatch, removeByIds, updateRetry, countQueued } from "./offlineQueue";

// Helper: espera (ms)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createTrackerSync({ supabase, tableName = "tracker_locations", batchSize = 100, maxRetries = 6 }) {
  let flushing = false;
  let backoffMs = 1000; // 1s inicial para reintento manual (online event)

  async function directInsert(row) {
    // Inserta UNA posición. Puedes cambiar a insert batch si tu flujo genera varias simultáneas.
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
      // Encola si falla (offline o error de red)
      await enqueuePosition({ ...row, _lastError: e.message || String(e) });
    }
  }

  // Drena la cola en lotes.
  async function flushQueue({ force = false } = {}) {
    if (flushing) return; // evita condiciones de carrera
    flushing = true;

    try {
      let more = true;
      while (more) {
        const batch = await peekBatch(batchSize);
        if (!batch.length) {
          more = false;
          break;
        }

        // Mapea a columnas reales (limpia metadata)
        const rows = batch.map(({ id, _retries, _lastError, ...rest }) => rest);

        try {
          await directBatchInsert(rows);
          const ids = batch.map((b) => b.id);
          await removeByIds(ids);
          // restablece backoff si venías de errores
          backoffMs = 1000;
        } catch (err) {
          // Error al insertar el lote
          const msg = err?.message || String(err);
          await updateRetry(batch, msg);

          // Si el error es por red/offline, sal del ciclo para reintentar cuando vuelva online
          if (!navigator.onLine) break;

          // Si es otro error del server, aplica backoff incremental
          backoffMs = Math.min(backoffMs * 2, 60_000); // tope 60s
          // corta si ya reintentaste muchas veces
          const maxed = batch.some((b) => (b._retries || 0) >= maxRetries);
          if (maxed && !force) {
            // Mantén en cola pero no hagas busy-loop; espera
            await sleep(backoffMs);
          } else {
            // espera antes de otro intento
            await sleep(backoffMs);
          }
          // rompe el while para no quemar CPU; volveremos a intentar al próximo online o llamado manual
          break;
        }
      }
    } finally {
      flushing = false;
    }
  }

  // Estado visible de la cola (útil para un badge en la UI)
  async function getQueueCount() {
    return countQueued();
  }

  // Listeners para reconexión
  function attachOnlineListener() {
    window.addEventListener("online", () => {
      flushQueue().catch(console.error);
    });
  }

  // Lanza un flush periódico opcional (por si no llega el evento 'online' en algunos WebViews)
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
