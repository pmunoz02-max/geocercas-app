// src/pages/Tracker.jsx
import { useEffect, useRef, useState } from "react";
import { supabase } from "../supabaseClient";
import { useAuth } from "../context/AuthContext";

import {
  enqueuePosition,
  flushQueue as flushQueueCore,
  getQueueStats,
} from "../lib/trackerQueue";

const MIN_INTERVAL_SEC = 5 * 60; // 5 minutos

export default function Tracker() {
  const { user } = useAuth();

  const [isReady, setIsReady] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [intervalSec, setIntervalSec] = useState(MIN_INTERVAL_SEC);
  const [statusMessage, setStatusMessage] = useState("Preparando tracker...");
  const [queueInfo, setQueueInfo] = useState({
    pending: 0,
    lastSentAt: null,
  });

  const watchIdRef = useRef(null);
  const flushTimerRef = useRef(null);
  const lastFlushTsRef = useRef(0);

  // ==============================
  // Stats simples de la cola
  // ==============================
  async function updateQueueInfo() {
    try {
      const stats = await getQueueStats();
      setQueueInfo({
        pending: stats?.pending ?? 0,
        lastSentAt: stats?.lastSentAt ?? null,
      });
    } catch (err) {
      console.error("Error getQueueStats():", err);
    }
  }

  // ==============================
  // Llamada directa a Edge Function send_position
  // ==============================
  async function sendPositionEdge(payload) {
    try {
      const { data, error } = await supabase.functions.invoke("send_position", {
        body: payload,
      });

      if (error) {
        console.error("[send_position] error invoke:", error);
        return {
          ok: false,
          error: error.message || "Error llamando a send_position",
        };
      }

      return data; // { ok, stored, reason, min_interval_ms, ... }
    } catch (err) {
      console.error("[send_position] exception:", err);
      return {
        ok: false,
        error: err?.message || "Error de red al llamar a send_position",
      };
    }
  }

  // ==============================
  // Enviar cola usando flushQueueCore
  // ==============================
  async function flushQueue(reason = "auto") {
    try {
      if (!isOnline) {
        setStatusMessage(
          `Sin conexión. Cola pendiente: ${queueInfo.pending} (motivo: ${reason})`
        );
        return;
      }

      setStatusMessage(`Enviando cola (${reason})...`);

      await flushQueueCore(async (item) => {
        const res = await sendPositionEdge(item);
        if (!res.ok) {
          throw new Error(res.error || "Error en send_position");
        }
        return res;
      });

      lastFlushTsRef.current = Date.now();
      await updateQueueInfo();

      setStatusMessage(
        `Cola enviada. Pendientes: ${queueInfo.pending ?? 0}`
      );
    } catch (err) {
      console.error("Error enviando cola:", err);
      setStatusMessage("Error al enviar cola. Se reintentará automáticamente.");
    }
  }

  // ==============================
  // Cargar intervalo configurado
  // ==============================
  async function loadTrackerInterval() {
    try {
      if (!user) return;

      const { data: persona, error } = await supabase
        .from("personal")
        .select("position_interval_sec")
        .eq("email", user.email)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error("Error leyendo intervalo personal:", error);
      }

      let baseIntervalSec = MIN_INTERVAL_SEC;

      if (persona?.position_interval_sec) {
        baseIntervalSec = Math.max(
          MIN_INTERVAL_SEC,
          Number(persona.position_interval_sec)
        );
      }

      setIntervalSec(baseIntervalSec);
      setStatusMessage(
        `Tracker listo. Intervalo: ${Math.round(baseIntervalSec / 60)} min`
      );
    } catch (err) {
      console.error("Error leyendo intervalo:", err);
      setIntervalSec(MIN_INTERVAL_SEC);
      setStatusMessage(
        "No se pudo leer configuración. Usando 5 min por defecto."
      );
    } finally {
      setIsReady(true);
    }
  }

  // ==============================
  // Geolocalización
  // ==============================
  function startWatch() {
    if (!("geolocation" in navigator)) {
      setStatusMessage("Geolocalización no soportada.");
      return;
    }

    try {
      const id = navigator.geolocation.watchPosition(
        async (pos) => {
          const payload = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            at: new Date(pos.timestamp).toISOString(),
          };

          await enqueuePosition(payload);
          await updateQueueInfo();

          setStatusMessage(
            `Posición encolada: ${payload.lat.toFixed(
              6
            )}, ${payload.lng.toFixed(6)}`
          );
        },
        (err) => {
          console.error("Error GPS:", err);
          setStatusMessage(`Error GPS: ${err.message}`);
        },
        {
          enableHighAccuracy: true,
          timeout: 30000,
          maximumAge: 10000,
        }
      );

      watchIdRef.current = id;
    } catch (err) {
      console.error("Error iniciando watchPosition:", err);
      setStatusMessage("No se pudo iniciar la geolocalización.");
    }
  }

  function stopWatch() {
    try {
      if (watchIdRef.current != null && "geolocation" in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    } catch (err) {
      console.error("Error al detener watchPosition:", err);
    }
    watchIdRef.current = null;
  }

  // ==============================
  // Efectos
  // ==============================

  // Cargar intervalo desde BD
  useEffect(() => {
    loadTrackerInterval();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Activar tracking automático cuando está listo
  useEffect(() => {
    if (!isReady) return;
    if (!user) {
      setStatusMessage("No hay usuario autenticado.");
      return;
    }
    setIsTracking(true);
  }, [isReady, user]);

  // Cuando tracking está activo: GPS + timer de flush
  useEffect(() => {
    if (!isTracking) {
      stopWatch();
      if (flushTimerRef.current) {
        clearInterval(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      return;
    }

    startWatch();

    const ms = Math.max(intervalSec * 1000, MIN_INTERVAL_SEC * 1000);

    flushTimerRef.current = setInterval(() => {
      const now = Date.now();
      const diff = now - lastFlushTsRef.current;
      if (diff >= ms) {
        flushQueue("interval");
      }
    }, ms / 2);

    // Primer intento suave al arrancar
    flushQueue("start");

    return () => {
      stopWatch();
      if (flushTimerRef.current) {
        clearInterval(flushTimerRef.current);
        flushTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTracking, intervalSec]);

  // Eventos online/offline
  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
      setStatusMessage("Conexión restaurada. Enviando cola...");
      flushQueue("online");
    }

    function handleOffline() {
      setIsOnline(false);
      setStatusMessage("Sin conexión. Encolando posiciones...");
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ==============================
  // Render
  // ==============================
  const onlineLabel = isOnline ? "Online" : "Offline";
  const onlineBadgeClass = isOnline
    ? "bg-green-100 text-green-800"
    : "bg-red-100 text-red-800";

  return (
    <div className="max-w-xl mx-auto p-4">
      <h1 className="text-xl font-semibold mb-3">Tracker</h1>

      {user && (
        <p className="text-sm text-gray-600 mb-2">
          Usuario: <span className="font-mono">{user.email}</span>
        </p>
      )}

      <div className="border rounded-lg p-4 bg-white shadow-sm">
        <div className="flex justify-between items-center mb-3">
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium ${onlineBadgeClass}`}
          >
            {onlineLabel}
          </span>
          <span className="text-xs text-gray-500">
            Intervalo: {Math.round(intervalSec / 60)} min (mín. 5 min)
          </span>
        </div>

        <p className="text-sm text-gray-700 mb-2">{statusMessage}</p>

        <div className="text-xs text-gray-500 space-y-1">
          <p>
            <strong>En cola:</strong> {queueInfo.pending ?? 0} posiciones
          </p>
          {queueInfo.lastSentAt && (
            <p>
              <strong>Último envío:</strong>{" "}
              {new Date(queueInfo.lastSentAt).toLocaleString()}
            </p>
          )}
          <p className="mt-2">
            Tracking automático. Las posiciones se envían al servidor cuando hay
            señal. El backend solo guarda los puntos que caen dentro de tus
            geocercas asignadas.
          </p>
        </div>
      </div>
    </div>
  );
}
