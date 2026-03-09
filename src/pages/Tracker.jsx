// src/pages/Tracker.jsx
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../supabaseClient";
import { useAuth } from "@/context/auth.js";

import {
  enqueuePosition,
  flushQueue as flushQueueCore,
  getQueueStats,
} from "../lib/trackerQueue";

const MIN_INTERVAL_SEC = 5 * 60; // 5 minutos

export default function Tracker() {
  const { t } = useTranslation();
  const tr = (key, fallback, options = {}) =>
    t(key, { defaultValue: fallback, ...options });

  const { user } = useAuth();

  const [isReady, setIsReady] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [intervalSec, setIntervalSec] = useState(MIN_INTERVAL_SEC);
  const [statusMessage, setStatusMessage] = useState(
    tr("tracker.messages.preparing", "Preparing tracker...")
  );
  const [queueInfo, setQueueInfo] = useState({
    pending: 0,
    lastSentAt: null,
  });

  const watchIdRef = useRef(null);
  const flushTimerRef = useRef(null);
  const lastFlushTsRef = useRef(0);

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

  async function sendPositionEdge(payload) {
    try {
      const { data, error } = await supabase.functions.invoke("send_position", {
        body: payload,
      });

      if (error) {
        console.error("[send_position] error invoke:", error);
        return {
          ok: false,
          error:
            error.message ||
            tr("tracker.errors.callSendPosition", "Error calling send_position"),
        };
      }

      return data;
    } catch (err) {
      console.error("[send_position] exception:", err);
      return {
        ok: false,
        error:
          err?.message ||
          tr("tracker.errors.networkSendPosition", "Network error calling send_position"),
      };
    }
  }

  async function flushQueue(reason = "auto") {
    try {
      if (!isOnline) {
        setStatusMessage(
          tr(
            "tracker.messages.offlineQueuePending",
            "No connection. Pending queue: {{count}} (reason: {{reason}})",
            {
              count: queueInfo.pending,
              reason,
            }
          )
        );
        return;
      }

      setStatusMessage(
        tr("tracker.messages.sendingQueue", "Sending queue ({{reason}})...", {
          reason,
        })
      );

      await flushQueueCore(async (item) => {
        const res = await sendPositionEdge(item);
        if (!res.ok) {
          throw new Error(res.error || tr("tracker.errors.sendPosition", "Error in send_position"));
        }
        return res;
      });

      lastFlushTsRef.current = Date.now();
      await updateQueueInfo();

      setStatusMessage(
        tr("tracker.messages.queueSent", "Queue sent. Pending: {{count}}", {
          count: queueInfo.pending ?? 0,
        })
      );
    } catch (err) {
      console.error("Error enviando cola:", err);
      setStatusMessage(
        tr(
          "tracker.errors.flushQueue",
          "Error sending queue. It will retry automatically."
        )
      );
    }
  }

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
        tr("tracker.messages.readyWithInterval", "Tracker ready. Interval: {{minutes}} min", {
          minutes: Math.round(baseIntervalSec / 60),
        })
      );
    } catch (err) {
      console.error("Error leyendo intervalo:", err);
      setIntervalSec(MIN_INTERVAL_SEC);
      setStatusMessage(
        tr(
          "tracker.messages.defaultInterval",
          "Could not read configuration. Using default 5 min."
        )
      );
    } finally {
      setIsReady(true);
    }
  }

  function startWatch() {
    if (!("geolocation" in navigator)) {
      setStatusMessage(
        tr("tracker.errors.geolocationUnsupported", "Geolocation is not supported.")
      );
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
            tr(
              "tracker.messages.positionQueued",
              "Queued position: {{lat}}, {{lng}}",
              {
                lat: payload.lat.toFixed(6),
                lng: payload.lng.toFixed(6),
              }
            )
          );
        },
        (err) => {
          console.error("Error GPS:", err);
          setStatusMessage(
            tr("tracker.errors.gps", "GPS error: {{message}}", {
              message: err.message,
            })
          );
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
      setStatusMessage(
        tr("tracker.errors.startGeolocation", "Could not start geolocation.")
      );
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

  useEffect(() => {
    loadTrackerInterval();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (!isReady) return;
    if (!user) {
      setStatusMessage(
        tr("tracker.errors.noAuthenticatedUser", "There is no authenticated user.")
      );
      return;
    }
    setIsTracking(true);
  }, [isReady, user, t]);

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

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
      setStatusMessage(
        tr("tracker.messages.connectionRestored", "Connection restored. Sending queue...")
      );
      flushQueue("online");
    }

    function handleOffline() {
      setIsOnline(false);
      setStatusMessage(
        tr("tracker.messages.offlineQueueing", "No connection. Queueing positions...")
      );
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

  const onlineLabel = isOnline
    ? tr("tracker.labels.online", "Online")
    : tr("tracker.labels.offline", "Offline");

  const onlineBadgeClass = isOnline
    ? "bg-green-100 text-green-800"
    : "bg-red-100 text-red-800";

  return (
    <div className="max-w-xl mx-auto p-4">
      <h1 className="text-xl font-semibold mb-3">
        {tr("tracker.title", "Tracker")}
      </h1>

      {user && (
        <p className="text-sm text-gray-600 mb-2">
          {tr("tracker.labels.user", "User")}:{" "}
          <span className="font-mono">{user.email}</span>
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
            {tr("tracker.labels.interval", "Interval")}: {Math.round(intervalSec / 60)}{" "}
            {tr("tracker.labels.minutes", "min")} (
            {tr("tracker.labels.minimum", "min. 5 min")})
          </span>
        </div>

        <p className="text-sm text-gray-700 mb-2">{statusMessage}</p>

        <div className="text-xs text-gray-500 space-y-1">
          <p>
            <strong>{tr("tracker.labels.inQueue", "In queue")}:</strong>{" "}
            {queueInfo.pending ?? 0} {tr("tracker.labels.positions", "positions")}
          </p>

          {queueInfo.lastSentAt && (
            <p>
              <strong>{tr("tracker.labels.lastSent", "Last sent")}:</strong>{" "}
              {new Date(queueInfo.lastSentAt).toLocaleString()}
            </p>
          )}

          <p className="mt-2">
            {tr(
              "tracker.description",
              "Automatic tracking. Positions are sent to the server when there is signal. The backend only stores points that fall inside your assigned geofences."
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
