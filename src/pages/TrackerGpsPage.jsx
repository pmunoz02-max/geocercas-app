// src/pages/TrackerGpsPage.jsx
import { useEffect, useRef, useState } from "react";

export default function TrackerGpsPage() {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [error, setError] = useState(null);

  const [permission, setPermission] = useState("unknown"); // unknown | granted | denied
  const [gpsActive, setGpsActive] = useState(false);
  const [lastPosition, setLastPosition] = useState(null);

  const watchIdRef = useRef(null);

  /* =========================
     1) Cargar sesión y validar rol
  ========================= */
  useEffect(() => {
    let alive = true;

    async function loadSession() {
      try {
        const res = await fetch("/api/auth/session", {
          credentials: "include",
        });

        const json = await res.json();
        if (!alive) return;

        setSession(json);

        if (!json?.authenticated) {
          setError("No autenticado");
          return;
        }

        const role = String(json?.role || "").toLowerCase();
        if (role !== "tracker") {
          setError(`Rol inválido para tracker-gps: ${role || "(vacío)"}`);
          return;
        }

        // Tracker válido → revisar permisos
        if ("permissions" in navigator) {
          try {
            const p = await navigator.permissions.query({ name: "geolocation" });
            if (!alive) return;
            setPermission(p.state); // granted | denied | prompt
          } catch {
            setPermission("unknown");
          }
        }
      } catch (e) {
        if (!alive) return;
        setError(e.message || "Error cargando sesión");
      } finally {
        if (alive) setLoading(false);
      }
    }

    loadSession();
    return () => {
      alive = false;
    };
  }, []);

  /* =========================
     2) Arrancar watchPosition
  ========================= */
  function startTracking() {
    if (!("geolocation" in navigator)) {
      setError("Este dispositivo no soporta GPS.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      () => {
        setPermission("granted");

        // Arrancar tracking continuo
        watchIdRef.current = navigator.geolocation.watchPosition(
          (pos) => {
            setGpsActive(true);
            setLastPosition({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              ts: new Date().toISOString(),
            });

            // 👉 AQUÍ luego conectas con tu envío real
            // fetch("/api/send_position", {...})
            console.log("GPS:", pos.coords.latitude, pos.coords.longitude);
          },
          (err) => {
            setGpsActive(false);
            setError(err.message || "Error obteniendo ubicación");
          },
          {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: 15000,
          }
        );
      },
      (err) => {
        setPermission("denied");
        setError("Permiso de ubicación denegado.");
      }
    );
  }

  /* =========================
     3) Cleanup
  ========================= */
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  /* =========================
     UI STATES
  ========================= */
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-600">Cargando tracker…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="max-w-md w-full bg-white border rounded-xl p-6 shadow">
          <h2 className="text-lg font-semibold text-red-600 mb-3">
            Acceso restringido
          </h2>
          <p className="text-sm text-gray-700 mb-4">{error}</p>
          <pre className="text-xs bg-gray-100 p-3 rounded overflow-auto">
{JSON.stringify(session, null, 2)}
          </pre>
        </div>
      </div>
    );
  }

  /* =========================
     Tracker válido
  ========================= */
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 max-w-md w-full">
        <h1 className="text-lg font-semibold text-emerald-700">
          Tracker activo
        </h1>

        <p className="text-sm text-emerald-700 mt-2">
          Estado del GPS:
          <b className="ml-1">
            {permission === "granted"
              ? "Permitido"
              : permission === "denied"
              ? "Bloqueado"
              : "Pendiente"}
          </b>
        </p>

        {!gpsActive && (
          <button
            onClick={startTracking}
            className="mt-4 w-full bg-emerald-600 text-white py-3 rounded-lg"
          >
            Activar ubicación
          </button>
        )}

        {gpsActive && lastPosition && (
          <div className="mt-4 text-sm text-emerald-800">
            <div>📡 GPS activo</div>
            <div>Lat: {lastPosition.lat}</div>
            <div>Lng: {lastPosition.lng}</div>
            <div>Última actualización: {lastPosition.ts}</div>
          </div>
        )}
      </div>
    </div>
  );
}
