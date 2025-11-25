// src/lib/trackerQueue.js
// Adaptador entre el Tracker.jsx y la cola offline basada en IndexedDB.
// Usa las funciones de src/tracker/offlineQueue.js

import {
  enqueuePosition as enqueueOffline,
  peekBatch,
  removeByIds,
  updateRetry,
  countQueued,
} from "../tracker/offlineQueue";

// Encola una posición en IndexedDB
// pos: { lat, lng, accuracy?, at?, meta? ... }
export async function enqueuePosition(pos) {
  return enqueueOffline(pos);
}

/**
 * Recorre la cola en lotes y llama a processItem(row) por cada posición.
 * - processItem debe ser una función async que haga el envío real (por ejemplo, sendPosition).
 * - Si processItem lanza error, se marcan reintentos y se detiene el flush.
 *
 * @param {Function} processItem  async (row) => any
 * @param {Object}   options      { batchSize?: number, maxRetries?: number }
 */
export async function flushQueue(processItem, options = {}) {
  const batchSize = options.batchSize ?? 100;
  const maxRetries = options.maxRetries ?? 6;

  let more = true;

  while (more) {
    const batch = await peekBatch(batchSize);
    if (!batch || batch.length === 0) {
      more = false;
      break;
    }

    // Limpiamos metadata interna antes de enviar
    const rows = batch.map(({ id, _retries, _lastError, ...rest }) => rest);
    const ids = batch.map((b) => b.id);

    try {
      // Procesamos cada fila secuencialmente usando la callback
      for (let i = 0; i < rows.length; i++) {
        await processItem(rows[i]);
      }

      // Si todo fue bien, eliminamos del store
      await removeByIds(ids);
    } catch (err) {
      const msg = err?.message || String(err);

      // Actualizamos contador de reintentos / último error
      await updateRetry(batch, msg);

      // Si ya superaron el máximo de reintentos, simplemente salimos;
      // la cola se quedará con estos elementos para depuración o manejo manual.
      const maxed = batch.some((b) => (b._retries || 0) + 1 >= maxRetries);
      if (maxed) {
        console.warn("[trackerQueue] Se alcanzó maxRetries para algunos items:", {
          error: msg,
        });
      }

      // Cortamos el while: el próximo flush (evento online, intervalo, etc.)
      // volverá a intentar.
      break;
    }
  }
}

// Alias compatible con versiones anteriores que esperaban flushQueueNow
export async function flushQueueNow(processItem, options = {}) {
  return flushQueue(processItem, options);
}

// Stats simples para la UI (opcional)
export async function getQueueStats() {
  const pending = await countQueued();
  // Si quieres llevar lastSentAt, se puede persistir en localStorage desde el Tracker.jsx
  return {
    pending,
    lastSentAt: null,
  };
}
