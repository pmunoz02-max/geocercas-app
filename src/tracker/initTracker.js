// src/tracker/initTracker.js
import { createTrackerSync } from "./trackerSync";
import { supabase } from "../supabaseClient"; // ajusta si tu cliente vive en otra ruta

// Úsalo en el montaje del componente Tracker (o en tu bootstrap)
export function initTrackerSyncLayer() {
  const sync = createTrackerSync({
    supabase,
    tableName: "tracker_locations", // o "position_events" si prefieres
    batchSize: 100,
    maxRetries: 6,
  });

  // Escucha reconexión y programa flushes periódicos
  sync.attachOnlineListener();
  sync.startPeriodicFlush(60_000); // cada 60s de forma defensiva

  return sync;
}
