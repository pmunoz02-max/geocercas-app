// src/pages/Tracker.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";

import { enqueuePosition, flushQueue as flushQueueCore, getQueueStats } from "../lib/trackerQueue";

// Backend es la fuente de verdad: mínimo real permitido hoy
const MIN_INTERVAL_SEC = 5 * 60; // 5 minutos
const CAN_SEND_REFRESH_MS = 20_000; // refresco “barato” del guard

function getActiveOrgIdFromStorage() {
  try {
    const v = localStorage.getItem("tg_current_org_id");
    return v && String(v).trim() ? String(v).trim() : null;
  } catch {
    return null;
  }
}

export default function Tracker() {
  const { user, currentOrg } = useAuth();

  const [isReady, setIsReady] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);

  // Intervalo efectivo: viene del backend/assignments (vista canónica)
  const [intervalSec, setIntervalSec] = useState(MIN_INTERVAL_SEC);

  const [statusMessage, setStatusMessage] = useState("Preparando tracker...");
  const [queueInfo, setQueueInfo] = useState({ pending: 0, lastSentAt: null });

  // Diagnóstico universal (DB-driven)
  const [guard, setGuard] = useState({
    checked: false,
    ok: false,
    reason: null,
    role: null,
    total: 0,
    active: 0,
  });

  const watchIdRef = useRef(null);
  const flushTimerRef = useRef(null);
  const lastFlushTsRef = useRef(0);

  const orgId = currentOrg?.id || getActiveOrgIdFromStorage();

  const canOperate = useMemo(() => {
    return Boolean(user?.id) && Boolean(orgId) && guard.checked && guard.ok;
  }, [user?.id, orgId, guard.checked, guard.ok]);

  function humanGuardReason(reason) {
    switch (reason) {
      case "no_auth":
        return "No hay sesión activa.";
      case "no_users_public_row":
        return "Tu perfil aún no está listo (users_public).";
      case "role_not_tracker":
        return "Esta cuenta no es Tracker. Este dispositivo solo acepta cuentas tracker.";
      case "no_assignments":
        return "No tienes asignaciones de geocercas (tracker_assignments).";
      case "no_active_assignments":
        return "Tus asignaciones existen, pero están inactivas.";
      case "no_org":
        return "No hay organización activa (tg_current_org_id).";
      default:
        return reason ? `No autorizado: ${reason}` : "No autorizado.";
    }
  }

  // ⚠️ Regla universal: NO signOut automático en flujo tracker
  async function refreshGuard(reason = "auto") {
    try {
      if (!user?.id) {
        setGuard({ checked: true, ok: false, reason: "no_auth", role: null, total: 0, active: 0 });
        return { ok: false, reason: "no_auth" };
      }
      if (!orgId) {
        setGuard({ checked: true, ok: false, reason: "no_org", role: null, total: 0, active: 0 });
        return { ok: false, reason: "no_org" };
      }

      const { data, error } = await supabase.rpc("rpc_tracker_can_send");

      if (error) {
        console.error("rpc_tracker_can_send error:", error);
        setGuard((g) => ({ ...g, checked: true, ok: false, reason: "rpc_error" }));
        setStatusMessage("Error consultando permisos del tracker (rpc).");
        return { ok: false, reason: "rpc_error" };
      }

      const row = Array.isArray(data) ? data[0] : data;

      const next = {
        checked: true,
        ok: Boolean(row?.ok),
        reason: row?.reason ?? null,
        role: row?.role ?? null,
        total: Number(row?.total ?? 0),
        active: Number(row?.active ?? 0),
      };

      setGuard(next);

      if (!next.ok) setStatusMessage(`${humanGuardReason(next.reason)} (${reason})`);
      return { ok: next.ok, reason: next.reason };
    } catch (err) {
      console.error("refreshGuard exception:", err);
      setGuard((g) => ({ ...g, checked: true, ok: false, reason: "exception" }));
      setStatusMessage("Error inesperado validando permisos.");
      return { ok: false, reason: "exception" };
    }
  }

  async function updateQueueInfo() {
    try {
      const stats = await getQueueStats();
      setQueueInfo({
        pending: stats?.pending ?? 0,
        lastSentAt: stats?.lastSentAt ?? null,
      });
      return stats;
    } catch (err) {
      console.error("Error getQueueStats():", err);
      return null;
    }
  }

  async function loadIntervalFromAssignments() {
    try {
      if (!user?.id) return MIN_INTERVAL_SEC;
      if (!orgId) return MIN_INTERVAL_SEC;

      const { data, error } = await supabase
        .from("v_tracker_assignments_ui")
        .select("frequency_minutes, active, org_id")
        .eq("org_id", orgId)
        .eq("tracker_user_id", user.id)
        .eq("active", true);

      if (error) {
        console.error("Error leyendo v_tracker_assignments_ui:", error);
        return MIN_INTERVAL_SEC;
      }

      if (!data || data.length === 0) return MIN_INTERVAL_SEC;

      const mins = data
        .map((r) => Number(r.frequency_minutes))
        .filter((n) => Number.isFinite(n) && n >= 5);

      if (mins.length === 0) return MIN_INTERVAL_SEC;

      const minMinutes = Math.min(...mins);
      return Math.max(MIN_INTERVAL_SEC, minMinutes * 60);
    } catch (err) {
      console.error("loadIntervalFromAssignments exception:", err);
      return MIN_INTERVAL_SEC;
    }
  }

  async function sendPositionEdge(payload) {
    try {
      // Supabase Edge Function canónica
      const { data, error } = await supabase.functions.invoke("send_position", { body: payload });

      if (error) {
        console.error("[send_position] error invoke:", error);
        return { ok: false, error: error.message || "Error send_position" };
      }

      return data;
    } catch (err) {
      console.error("[send_position] exception:", err);
      return { ok: false, error: err?.message || "Error de red send_position" };
    }
  }

  async function flushQueue(reason = "auto") {
    try {
      if (!isOnline) {
        const stats = await updateQueueInfo();
        setStatusMessage(`Sin conexión. Cola pendiente: ${stats?.pending ?? queueInfo.pending} (motivo: ${reason})`);
        return;
      }

      if (!canOperate) {
        setStatusMessage(`${humanGuardReason(guard.reason)} (${reason})`);
        return;
      }

      setStatusMessage(`Enviando cola (${reason})...`);

      await flushQueueCore(async (item) => {
        // Adjuntamos org_id siempre
        const res = await sendPositionEdge({ ...item, org_id: orgId });

        if (res?.min_interval_ms) {
          const sec = Math.max(MIN_INTERVAL_SEC, Math.ceil(res.min_interval_ms / 1000));
          setIntervalSec(sec);
        }

        if (!res?.ok) {
          if (res?.reason === "no_assignments" || res?.reason === "role_not_tracker") {
            await refreshGuard("send_position");
          }
          throw new Error(res?.error || res?.reason || "Error en send_position");
        }

        return res;
      });

      lastFlushTsRef.current = Date.now();
      const stats = await updateQueueInfo();

      setStatusMessage(`Cola enviada. Pendientes: ${stats?.pending ?? 0}`);
    } catch (err) {
      console.error("Error enviando cola:", err);
      setStatusMessage("Error al enviar cola. Se reintentará automáticamente.");
    }
  }

  function startWatch() {
    if (!("geolocation" in navigator)) {
      setStatusMessage("Geolocalización no soportada.");
      return;
    }

    try {
      const id = navigator.geolocation.watchPosition(
        async (pos) => {
          if (!canOperate) return;

          const payload = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            at: new Date(pos.timestamp).toISOString(),
          };

          await enqueuePosition(payload);
          const stats = await updateQueueInfo();

          setStatusMessage(
            `Posición encolada (${stats?.pending ?? 0}): ${payload.lat.toFixed(6)}, ${payload.lng.toFixed(6)}`
          );
        },
        (err) => {
          console.error("Error GPS:", err);
          setStatusMessage(`Error GPS: ${err.message}`);
        },
        { enableHighAccuracy: true, timeout: 30000, maximumAge: 10000 }
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

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      setIsReady(false);
      setStatusMessage("Preparando tracker...");

      if (!user?.id) {
        setGuard({ checked: true, ok: false, reason: "no_auth", role: null, total: 0, active: 0 });
        setIsReady(true);
        setIsTracking(false);
        return;
      }

      if (!orgId) {
        setGuard({ checked: true, ok: false, reason: "no_org", role: null, total: 0, active: 0 });
        setStatusMessage(humanGuardReason("no_org"));
        setIsReady(true);
        setIsTracking(false);
        return;
      }

      const g = await refreshGuard("boot");
      if (cancelled) return;

      const sec = await loadIntervalFromAssignments();
      if (cancelled) return;

      setIntervalSec(sec);

      if (g.ok) setStatusMessage(`Tracker listo. Intervalo: ${Math.round(sec / 60)} min`);
      else setStatusMessage(humanGuardReason(g.reason));

      setIsReady(true);
    }

    boot();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, orgId]);

  useEffect(() => {
    if (!user?.id || !orgId) return;
    const t = setInterval(() => refreshGuard("poll"), CAN_SEND_REFRESH_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, orgId]);

  useEffect(() => {
    if (!isReady) return;
    if (!user?.id || !orgId) {
      setIsTracking(false);
      return;
    }
    if (!guard.checked) return;
    setIsTracking(guard.ok);
  }, [isReady, user?.id, orgId, guard.checked, guard.ok]);

  useEffect(() => {
    if (!isTracking) {
      stopWatch();
      if (flushTimerRef.current) clearInterval(flushTimerRef.current);
      flushTimerRef.current = null;
      return;
    }

    startWatch();

    const ms = Math.max(intervalSec * 1000, MIN_INTERVAL_SEC * 1000);

    flushTimerRef.current = setInterval(() => {
      const now = Date.now();
      const diff = now - lastFlushTsRef.current;
      if (diff >= ms) flushQueue("interval");
    }, ms / 2);

    flushQueue("start");

    return () => {
      stopWatch();
      if (flushTimerRef.current) clearInterval(flushTimerRef.current);
      flushTimerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTracking, intervalSec, canOperate]);

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

  const onlineLabel = isOnline ? "Online" : "Offline";
  const onlineBadgeClass = isOnline ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800";
  const guardBadgeClass = guard.ok ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800";

  return (
    <div className="max-w-xl mx-auto p-4">
      <h1 className="text-xl font-semibold mb-3">Tracker</h1>

      {user && (
        <p className="text-sm text-gray-600 mb-2">
          Usuario: <span className="font-mono">{user.email}</span>
        </p>
      )}

      {orgId ? (
        <p className="text-xs text-gray-500 mb-3">
          Org activa: <span className="font-mono">{orgId}</span>
        </p>
      ) : null}

      <div className="border rounded-lg p-4 bg-white shadow-sm">
        <div className="flex justify-between items-center mb-3 gap-2">
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium ${onlineBadgeClass}`}>
            {onlineLabel}
          </span>

          <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium ${guardBadgeClass}`}>
            {guard.ok ? "Autorizado" : "Bloqueado"}
          </span>

          <span className="text-xs text-gray-500">Intervalo: {Math.round(intervalSec / 60)} min (mín. 5 min)</span>
        </div>

        <p className="text-sm text-gray-700 mb-2">{statusMessage}</p>

        <div className="text-xs text-gray-500 space-y-1">
          <p>
            <strong>Assignments:</strong> total {guard.total} / activos {guard.active}
          </p>
          <p>
            <strong>En cola:</strong> {queueInfo.pending ?? 0} posiciones
          </p>

          {queueInfo.lastSentAt && (
            <p>
              <strong>Último envío:</strong> {new Date(queueInfo.lastSentAt).toLocaleString()}
            </p>
          )}

          <p className="mt-2">
            Tracker DB-driven: el backend decide si puedes enviar (roles + assignments). Este dispositivo muestra estado y nunca
            cierra sesión automáticamente.
          </p>
        </div>
      </div>
    </div>
  );
}
