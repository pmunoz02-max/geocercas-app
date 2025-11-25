// src/pages/TrackerDashboard.jsx
import { useEffect, useRef, useState, useMemo } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { supabase } from "../supabaseClient";
import { useAuth } from "../context/AuthContext.jsx";

const AUTO_REFRESH_MS = 30_000; // refresco automático cada 30s

const TIME_WINDOWS = [
  { label: "1 hora", valueHours: 1 },
  { label: "6 horas", valueHours: 6 },
  { label: "24 horas", valueHours: 24 },
];

export default function TrackerDashboard() {
  const { session, currentOrg } = useAuth();

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [geocercas, setGeocercas] = useState([]);
  const [logs, setLogs] = useState([]);
  const [trackers, setTrackers] = useState([]);

  const [selectedTrackerId, setSelectedTrackerId] = useState("all");
  const [timeWindowHours, setTimeWindowHours] = useState(6);

  const mapRef = useRef(null);
  const geocercaLayerRef = useRef(null);
  const logsLayerRef = useRef(null);

  // ---------- Derivados ----------

  const filteredLogs = useMemo(() => {
    if (selectedTrackerId === "all") return logs;
    return logs.filter((l) => l.user_id === selectedTrackerId);
  }, [logs, selectedTrackerId]);

  // ---------- Inicializar mapa ----------

  useEffect(() => {
    if (mapRef.current) return;

    const map = L.map("tracker-dashboard-map", {
      center: [0, 0],
      zoom: 2,
      zoomControl: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;
  }, []);

  // ---------- Carga de datos (geocercas + perfiles + logs) ----------

  useEffect(() => {
    if (!session) {
      setErrorMsg("No hay usuario autenticado.");
      return;
    }
    if (!currentOrg?.id) {
      setErrorMsg(
        "No hay organización/tenant activo en el contexto. Selecciona una organización antes de usar el dashboard."
      );
      return;
    }

    let cancelled = false;

    const loadData = async () => {
      setIsLoading(true);
      setErrorMsg("");

      try {
        const tenantId = currentOrg.id;
        console.log("[TrackerDashboard] tenantId usado (currentOrg.id):", tenantId);

        // 1) Geocercas visibles y activas para esta org
        const { data: geocData, error: geocErr } = await supabase
          .from("geocercas")
          .select(
            `
            id,
            nombre,
            name,
            geojson,
            geom,
            polygon,
            tenant_id,
            org_id,
            visible,
            activa,
            activo
          `
          )
          .eq("org_id", tenantId)          // 🔹 match directo con org_id
          .eq("visible", true)             // solo visibles
          .or("activa.eq.true,activo.eq.true"); // activa/activo true

        if (geocErr) {
          console.error("[TrackerDashboard] Error cargando geocercas:", geocErr);
          throw new Error("No se pudieron cargar las geocercas.");
        }

        console.log(
          "[TrackerDashboard] geocercas recibidas desde Supabase:",
          geocData
        );

        // 2) Trackers = perfiles (user_id, email)
        const { data: profilesData, error: profErr } = await supabase
          .from("profiles")
          .select("user_id, email");

        if (profErr) {
          console.error("[TrackerDashboard] Error cargando perfiles:", profErr);
          throw new Error("No se pudieron cargar los perfiles/trackers.");
        }

        console.log(
          "[TrackerDashboard] perfiles/trackers cargados:",
          profilesData
        );

        // 3) Logs de tracking en la ventana seleccionada
        const now = new Date();
        const fromIso = new Date(
          now.getTime() - timeWindowHours * 60 * 60 * 1000
        ).toISOString();

        console.log(
          "[TrackerDashboard] ventana de tiempo desde:",
          fromIso,
          "hasta:",
          now.toISOString()
        );

        const { data: logsData, error: logsErr } = await supabase
          .from("tracker_logs")
          .select(
            "id, user_id, lat, lng, accuracy, recorded_at, received_at, meta, tenant_id"
          )
          .eq("tenant_id", tenantId)
          .gte("received_at", fromIso)
          .order("received_at", { ascending: false })
          .limit(800);

        if (logsErr) {
          console.error(
            "[TrackerDashboard] Error cargando tracker_logs:",
            logsErr
          );
          throw new Error("No se pudieron cargar los registros de tracking.");
        }

        console.log(
          "[TrackerDashboard] logs de tracking recibidos:",
          logsData
        );

        if (cancelled) return;

        setGeocercas(geocData || []);
        setTrackers(profilesData || []);
        setLogs(logsData || []);
      } catch (err) {
        console.error("[TrackerDashboard] Error general:", err);
        if (!cancelled) {
          setErrorMsg(
            err?.message ||
              "Error cargando datos del dashboard. Revisa la consola del navegador."
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    loadData();

    const timer = setInterval(loadData, AUTO_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [session, currentOrg, timeWindowHours]);

  // ---------- Dibujar geocercas + puntos en el mapa ----------

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // limpiar capas anteriores
    if (geocercaLayerRef.current) {
      geocercaLayerRef.current.remove();
      geocercaLayerRef.current = null;
    }
    if (logsLayerRef.current) {
      logsLayerRef.current.remove();
      logsLayerRef.current = null;
    }

    const boundsPoints = [];

    // 1) Geocercas
    if (geocercas.length) {
      const geocGroup = L.layerGroup().addTo(map);

      geocercas.forEach((g) => {
        // Preferimos geojson; si no hay, usamos geom; si no, polygon
        const rawGeom = g.geojson ?? g.geom ?? g.polygon;
        if (!rawGeom) return;

        try {
          const gj =
            typeof rawGeom === "string" ? JSON.parse(rawGeom) : rawGeom;

          const layer = L.geoJSON(gj, {
            style: {
              color: "#1976d2",
              weight: 2,
              fillOpacity: 0.15,
            },
          }).addTo(geocGroup);

          try {
            const b = layer.getBounds();
            if (b.isValid()) {
              boundsPoints.push(b.getSouthWest(), b.getNorthEast());
            }
          } catch (e) {
            console.warn("No se pudo obtener bounds de geocerca", g.id, e);
          }
        } catch (e) {
          console.warn("GeoJSON/geom/polygon inválido para geocerca", g.id, e);
        }
      });

      geocercaLayerRef.current = geocGroup;
    }

    // 2) Puntos de tracking
    if (filteredLogs.length) {
      const logsGroup = L.layerGroup().addTo(map);

      filteredLogs.forEach((log) => {
        if (
          typeof log.lat !== "number" ||
          typeof log.lng !== "number" ||
          Number.isNaN(log.lat) ||
          Number.isNaN(log.lng)
        ) {
          return;
        }

        const latLng = L.latLng(log.lat, log.lng);
        boundsPoints.push(latLng);

        L.circleMarker(latLng, {
          radius: 8,
          color: "#ff0000",
          weight: 2,
          fillColor: "#ff5722",
          fillOpacity: 0.95,
        }).addTo(logsGroup);
      });

      logsLayerRef.current = logsGroup;
    }

    // 3) Fit bounds si hay algo que mostrar
    if (boundsPoints.length) {
      const allBounds = L.latLngBounds(boundsPoints);
      if (allBounds.isValid()) {
        map.fitBounds(allBounds.pad(0.3));
      }
    } else {
      // Si no hay nada, centrar a vista "global"
      map.setView([0, 0], 2);
    }
  }, [geocercas, filteredLogs]);

  // ---------- Helpers de UI ----------

  const trackersOptions = useMemo(() => {
    const opts = [{ value: "all", label: "Todos los trackers" }];
    trackers.forEach((p) => {
      if (!p.user_id) return;
      opts.push({
        value: p.user_id,
        label: p.email || p.user_id,
      });
    });
    return opts;
  }, [trackers]);

  const currentWindowLabel =
    TIME_WINDOWS.find((w) => w.valueHours === timeWindowHours)?.label ||
    `${timeWindowHours} h`;

  // ---------- Render ----------

  if (!session) {
    return (
      <div className="container mx-auto px-4 py-6">
        <h1 className="text-2xl font-semibold mb-4">
          Dashboard de Tracking en tiempo real
        </h1>
        <div className="bg-red-50 text-red-700 border border-red-200 px-4 py-3 rounded">
          No hay usuario autenticado.
        </div>
      </div>
    );
  }

  if (!currentOrg?.id) {
    return (
      <div className="container mx-auto px-4 py-6">
        <h1 className="text-2xl font-semibold mb-4">
          Dashboard de Tracking en tiempo real
        </h1>
        <div className="bg-red-50 text-red-700 border border-red-200 px-4 py-3 rounded">
          No hay organización/tenant activo en el contexto. Selecciona una
          organización antes de usar el dashboard.
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold">
            Dashboard de Tracking en tiempo real
          </h1>
          <p className="text-gray-600">
            Visualiza la ubicación de tus trackers sobre tus geocercas activas.
            Los puntos se actualizan automáticamente cada 30 segundos.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            // fuerza recarga manual
            setTimeWindowHours((prev) => prev); // dispara el useEffect
          }}
          className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 text-sm"
        >
          {isLoading ? "Cargando..." : "Refrescar ahora"}
        </button>
      </div>

      <div className="mb-3 flex flex-wrap gap-4 items-center">
        <div className="flex items-center gap-2">
          <span className="font-medium">Tracker:</span>
          <select
            className="border rounded px-2 py-1 text-sm"
            value={selectedTrackerId}
            onChange={(e) => setSelectedTrackerId(e.target.value)}
          >
            {trackersOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-medium">Ventana:</span>
          <select
            className="border rounded px-2 py-1 text-sm"
            value={timeWindowHours}
            onChange={(e) => setTimeWindowHours(Number(e.target.value))}
          >
            {TIME_WINDOWS.map((tw) => (
              <option key={tw.valueHours} value={tw.valueHours}>
                {tw.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {errorMsg && (
        <div className="mb-3 bg-red-50 text-red-700 border border-red-200 px-4 py-3 rounded">
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(260px,320px)] gap-4">
        {/* Mapa */}
        <div className="bg-slate-100 rounded shadow-inner">
          <div
            id="tracker-dashboard-map"
            className="w-full h-[520px] rounded"
          />
        </div>

        {/* Panel derecho */}
        <div className="bg-white border rounded shadow-sm p-4 text-sm">
          <h2 className="font-semibold mb-2">Resumen</h2>

          <p className="mb-1">
            <strong>Ventana:</strong> {currentWindowLabel}
          </p>
          <p className="mb-1">
            <strong>Geocercas activas:</strong> {geocercas.length}
          </p>
          <p className="mb-1">
            <strong>Trackers (perfiles):</strong> {trackers.length}
          </p>
          <p className="mb-2">
            <strong>Puntos en mapa (filtro actual):</strong>{" "}
            {filteredLogs.length}
          </p>

          <p className="text-gray-600 mt-3">
            Los puntos de tracking se muestran directamente en el mapa. Solo se
            visualizan dentro del área de las geocercas (usando el contorno de
            cada geocerca como filtro aproximado).
          </p>
        </div>
      </div>
    </div>
  );
}
