// src/pages/NuevaGeocerca.jsx
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  FeatureGroup,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import "@geoman-io/leaflet-geoman-free";

// 🔴 IMPORTANTE: desactivamos dataset externo para evitar el error del GeoJSON
const DATA_SOURCE = null; // 'geojson' | 'csv' | 'supabase' | null
const GEOJSON_URL = "/data/mapa_corto_214.geojson";
const CSV_URL = "/data/mapa_corto_214.csv";

const SUPABASE_POINTS_TABLE = "puntos_mapa_corto";
const SUPABASE_GEOFENCES_TABLE = "geocercas";

// ===== Utils (dataset) =====
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const latKey =
    headers.find((h) => ["lat", "latitude", "y"].includes(h)) || "lat";
  const lonKey =
    headers.find((h) => ["lon", "lng", "long", "longitude", "x"].includes(h)) ||
    "lon";

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());
    const row = {};
    headers.forEach((h, idx) => (row[h] = cols[idx]));
    const lat = parseFloat(row[latKey]);
    const lon = parseFloat(row[lonKey]);
    if (!Number.isNaN(lat) && !Number.isNaN(lon)) rows.push({ ...row, lat, lon });
  }
  return rows;
}

function pointsToFeatureCollection(rows) {
  return {
    type: "FeatureCollection",
    features: rows.map((r, i) => ({
      type: "Feature",
      properties: { ...r, _idx: i },
      geometry: { type: "Point", coordinates: [r.lon, r.lat] },
    })),
  };
}

async function loadShortMap({ source = DATA_SOURCE, supabase = null }) {
  if (!source) return null;

  if (source === "geojson") {
    const res = await fetch(GEOJSON_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`No se pudo cargar ${GEOJSON_URL}`);
    const data = await res.json();
    if (!data || data.type !== "FeatureCollection") {
      throw new Error("GeoJSON inválido: se esperaba FeatureCollection");
    }
    return data;
  }

  if (source === "csv") {
    const res = await fetch(CSV_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`No se pudo cargar ${CSV_URL}`);
    const text = await res.text();
    const rows = parseCSV(text);
    return pointsToFeatureCollection(rows);
  }

  if (source === "supabase") {
    if (!supabase)
      throw new Error("Supabase no disponible para puntos del mapa");
    const { data, error } = await supabase
      .from(SUPABASE_POINTS_TABLE)
      .select("*")
      .limit(10000);
    if (error) throw error;
    const rows = (data || [])
      .map((r, i) => ({
        lat: parseFloat(r.lat),
        lon: parseFloat(r.lon),
        ...r,
        _idx: i,
      }))
      .filter((r) => !Number.isNaN(r.lat) && !Number.isNaN(r.lon));
    return pointsToFeatureCollection(rows);
  }

  throw new Error("DATA_SOURCE no reconocido");
}

// ===== Geocercas helpers =====
async function listGeofences({ supabase = null }) {
  const list = [];

  if (supabase) {
    const { data, error } = await supabase
      .from(SUPABASE_GEOFENCES_TABLE)
      .select("id, nombre")
      .order("nombre", { ascending: true });
    if (!error && data) {
      data.forEach((r) =>
        list.push({ id: r.id, nombre: r.nombre, source: "supabase" })
      );
    }
  }

  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    if (k.startsWith("geocerca_")) {
      try {
        const raw = localStorage.getItem(k);
        const obj = JSON.parse(raw || "{}");
        const nombre = obj?.nombre || k.replace(/^geocerca_/, "");
        list.push({ key: k, nombre, source: "local" });
      } catch {
        list.push({
          key: k,
          nombre: k.replace(/^geocerca_/, ""),
          source: "local",
        });
      }
    }
  }

  // Unificar por nombre
  const seen = new Set();
  const unique = [];
  for (const g of list) {
    if (seen.has(g.nombre)) continue;
    seen.add(g.nombre);
    unique.push(g);
  }
  unique.sort((a, b) => a.nombre.localeCompare(b.nombre));
  return unique;
}

async function deleteGeofences({ items, supabase = null }) {
  let deleted = 0;

  const supaTargets = items.filter((x) => x.source === "supabase");
  if (supabase && supaTargets.length) {
    const nombres = supaTargets.map((x) => x.nombre);
    const { error, count } = await supabase
      .from(SUPABASE_GEOFENCES_TABLE)
      .delete({ count: "exact" })
      .in("nombre", nombres);
    if (error) throw error;
    deleted += count || 0;
  }

  const localTargets = items.filter((x) => x.source === "local");
  for (const it of localTargets) {
    const key = it.key || `geocerca_${it.nombre}`;
    if (localStorage.getItem(key) !== null) {
      localStorage.removeItem(key);
      deleted += 1;
    }
  }

  return deleted;
}

async function loadGeofenceGeometryByName({ name, supabase = null }) {
  if (supabase) {
    // ✅ Solo pedimos geojson (geometry no existe en tu tabla)
    const { data, error } = await supabase
      .from(SUPABASE_GEOFENCES_TABLE)
      .select("geojson")
      .eq("nombre", name)
      .maybeSingle();
    if (error) throw error;

    if (data?.geojson) return data.geojson; // FeatureCollection
  }
  const key = `geocerca_${name}`;
  const raw = localStorage.getItem(key);
  if (raw) {
    try {
      const obj = JSON.parse(raw);
      return obj?.geometry || obj?.geojson || null;
    } catch {
      return null;
    }
  }
  return null;
}

// Elige 1 feature para pintar
function primaryFeatureFromGeoJSON(geojson) {
  if (!geojson) return null;
  if (geojson.type === "Feature") return geojson;

  if (
    geojson.type === "FeatureCollection" &&
    Array.isArray(geojson.features) &&
    geojson.features.length
  ) {
    let best = geojson.features[0];
    let bestScore = -Infinity;

    for (const f of geojson.features) {
      try {
        const lyr = L.geoJSON(f);
        const b = lyr.getBounds();
        if (b && b.isValid()) {
          const score = Math.abs(
            (b.getNorth() - b.getSouth()) * (b.getEast() - b.getWest())
          );
          if (score > bestScore) {
            best = f;
            bestScore = score;
          }
        }
      } catch {}
    }
    return best || null;
  }

  if (
    geojson.type === "MultiPolygon" ||
    geojson.type === "Polygon" ||
    geojson.type === "GeometryCollection"
  ) {
    return { type: "Feature", properties: {}, geometry: geojson };
  }

  return null;
}

// Ahora acepta name para poner tooltip
function addSingleFeatureToFeatureGroup({ featureGroupRef, feature, name }) {
  if (!featureGroupRef?.current || !feature) return 0;
  let count = 0;
  const layer = L.geoJSON(feature, { pmIgnore: false });
  layer.eachLayer((lyr) => {
    if (name) {
      try {
        lyr.bindTooltip(String(name), {
          direction: "top",
          permanent: false,
        });
      } catch {}
    }
    featureGroupRef.current.addLayer(lyr);
    count += 1;
  });
  return count;
}

function fitToFeatureCollection(map, fc) {
  try {
    const layer = L.geoJSON(fc);
    const b = layer.getBounds();
    if (b.isValid()) map.fitBounds(b.pad(0.2));
  } catch (e) {
    console.warn("No fue posible calcular bounds del dataset", e);
  }
}

// ===== Geoman controls =====
function GeomanControls({
  featureGroupRef,
  selectedLayerRef,
  lastCreatedLayerRef,
  getCurrentName,
}) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;

    map.pm.addControls({
      position: "topleft",
      drawMarker: true,
      drawCircleMarker: false,
      drawPolyline: true,
      drawRectangle: true,
      drawPolygon: true,
      drawCircle: false,
      editMode: true,
      dragMode: true,
      cutPolygon: true,
      removalMode: true,
    });

    map.pm.setGlobalOptions({
      snappable: true,
      snapDistance: 20,
      allowSelfIntersection: false,
    });

    const onCreate = (e) => {
      if (featureGroupRef?.current) {
        // Si hay nombre actual, lo ponemos como tooltip de la nueva capa
        const nm =
          (typeof getCurrentName === "function" && getCurrentName()) || "";
        if (nm && e?.layer?.bindTooltip) {
          try {
            e.layer.bindTooltip(String(nm), {
              direction: "top",
              permanent: false,
            });
          } catch {}
        }
        featureGroupRef.current.addLayer(e.layer);
        lastCreatedLayerRef.current = e.layer;
      }
    };

    const onSelect = (e) => {
      selectedLayerRef.current = e.layer || null;
    };
    const onUnselect = () => {
      selectedLayerRef.current = null;
    };

    map.on("pm:create", onCreate);
    map.on("pm:globaleditmodetoggled", onUnselect);
    map.on("pm:remove", onUnselect);
    map.on("pm:markerdragstart", onSelect);
    map.on("pm:dragstart", onSelect);
    map.on("pm:select", onSelect);
    map.on("pm:deselect", onUnselect);

    return () => {
      map.off("pm:create", onCreate);
      map.off("pm:globaleditmodetoggled", onUnselect);
      map.off("pm:remove", onUnselect);
      map.off("pm:markerdragstart", onSelect);
      map.off("pm:dragstart", onSelect);
      map.off("pm:select", onSelect);
      map.off("pm:deselect", onUnselect);
    };
  }, [map, featureGroupRef, selectedLayerRef, lastCreatedLayerRef, getCurrentName]);

  return null;
}

// ===== Main component =====
export default function NuevaGeocerca({ supabaseClient = null }) {
  const [dataset, setDataset] = useState(null);
  const [loadingDataset, setLoadingDataset] = useState(!!DATA_SOURCE);
  const [datasetError, setDatasetError] = useState(null);

  const [geofenceList, setGeofenceList] = useState([]);
  const [selectedNames, setSelectedNames] = useState(new Set());

  const mapRef = useRef(null);
  const featureGroupRef = useRef(null);
  const selectedLayerRef = useRef(null);
  const lastCreatedLayerRef = useRef(null);
  const [cursorLatLng, setCursorLatLng] = useState(null);

  const [geofenceName, setGeofenceName] = useState("");
  const [coordModalOpen, setCoordModalOpen] = useState(false);
  const [coordText, setCoordText] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      if (!DATA_SOURCE) return;
      try {
        setLoadingDataset(true);
        const fc = await loadShortMap({
          source: DATA_SOURCE,
          supabase: supabaseClient,
        });
        if (!active) return;
        setDataset(fc);
      } catch (e) {
        if (!active) return;
        setDatasetError(e.message || "Error al cargar dataset");
      } finally {
        if (active) setLoadingDataset(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [supabaseClient]);

  const refreshGeofenceList = useCallback(async () => {
    const list = await listGeofences({ supabase: supabaseClient });
    setGeofenceList(list);
  }, [supabaseClient]);

  useEffect(() => {
    refreshGeofenceList();
  }, [refreshGeofenceList]);

  const onMapReady = useCallback(
    (map) => {
      mapRef.current = map;
      const move = (e) => {
        const { lat, lng } = e.latlng || {};
        if (typeof lat === "number" && typeof lng === "number") {
          setCursorLatLng({ lat, lng });
        }
      };
      map.on("mousemove", move);
      if (dataset) fitToFeatureCollection(map, dataset);
      return () => map.off("mousemove", move);
    },
    [dataset]
  );

  useEffect(() => {
    if (mapRef.current && dataset) fitToFeatureCollection(mapRef.current, dataset);
  }, [dataset]);

  const saveGeofenceCollection = useCallback(
    async ({ name }) => {
      let layerToSave = selectedLayerRef.current || lastCreatedLayerRef.current;
      const layers = [];
      featureGroupRef.current?.eachLayer((l) => layers.push(l));

      if (!layerToSave) {
        if (layers.length === 1) layerToSave = layers[0];
        else throw new Error("Selecciona una única geometría antes de guardar.");
      }

      const gj = layerToSave.toGeoJSON();
      const feature =
        gj.type === "Feature"
          ? gj
          : { type: "Feature", properties: {}, geometry: gj.geometry || gj };

      const existingNames = new Set(
        geofenceList.map((g) => g.nombre.toLowerCase())
      );
      if (existingNames.has((name || "").toLowerCase())) {
        alert("LA GEOCERCA YA EXISTE, CAMBIA DE NOMBRE");
        return { ok: false, duplicate: true };
      }

      if (supabaseClient) {
        let created_by = null;
        try {
          const { data } = await supabaseClient.auth.getUser();
          created_by = data?.user?.id || null;
        } catch {}

        // ✅ Guardamos siempre como FeatureCollection en columna geojson
        const fc = { type: "FeatureCollection", features: [feature] };
        const payload = {
          nombre: name,
          geojson: fc,
          ...(created_by ? { created_by } : {}),
        };
        const { data, error } = await supabaseClient
          .from(SUPABASE_GEOFENCES_TABLE)
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        return { ok: true, via: "supabase:geojson", id: data?.id };
      } else {
        const key = `geocerca_${name}`;
        localStorage.setItem(
          key,
          JSON.stringify({
            nombre: name,
            geometry: feature,
            props: { source: "UI", version: 3 },
          })
        );
        return { ok: true, via: "localStorage", key };
      }
    },
    [geofenceList, supabaseClient]
  );

  const handleSave = useCallback(async () => {
    const name = geofenceName.trim();
    if (!name) {
      alert("Escribe el nombre de la geocerca.");
      return;
    }
    try {
      const result = await saveGeofenceCollection({ name });
      if (result?.ok) {
        alert(`✅ Geocerca "${name}" guardada.`);
        await refreshGeofenceList();
      }
    } catch (e) {
      alert(`❌ ${e.message || e}`);
    }
  }, [geofenceName, saveGeofenceCollection, refreshGeofenceList]);

  const openCoordModal = useCallback(() => {
    setCoordText("");
    setCoordModalOpen(true);
  }, []);
  const closeCoordModal = useCallback(() => setCoordModalOpen(false), []);
  const applyCoordinates = useCallback(() => {
    const lines = coordText
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    const latlngs = [];
    for (const line of lines) {
      const parts = line.split(/[,\s]+/).map((x) => x.trim());
      if (parts.length < 2) continue;
      const lat = parseFloat(parts[0]);
      const lng = parseFloat(parts[1]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) latlngs.push([lat, lng]);
    }
    if (latlngs.length < 3) {
      alert(
        "Se requieren al menos 3 coordenadas (lat,lng) para un polígono."
      );
      return;
    }
    const poly = L.polygon(latlngs, { pmIgnore: false });
    const nm = geofenceName.trim();
    if (nm) {
      try {
        poly.bindTooltip(nm, { direction: "top", permanent: false });
      } catch {}
    }
    featureGroupRef.current?.addLayer(poly);
    lastCreatedLayerRef.current = poly;
    try {
      const bounds = poly.getBounds();
      if (mapRef.current && bounds.isValid())
        mapRef.current.fitBounds(bounds.pad(0.2));
    } catch {}
    setCoordModalOpen(false);
  }, [coordText, geofenceName]);

  const clearCanvas = useCallback(() => {
    featureGroupRef.current?.clearLayers();
    selectedLayerRef.current = null;
    lastCreatedLayerRef.current = null;
  }, []);

  const drawGeofences = useCallback(
    async (names, { append = false, zoom = true } = {}) => {
      if (!append) clearCanvas();
      let shown = 0;
      for (const name of names) {
        try {
          const geojson = await loadGeofenceGeometryByName({
            name,
            supabase: supabaseClient,
          });
          const feature = primaryFeatureFromGeoJSON(geojson);
          if (feature)
            shown += addSingleFeatureToFeatureGroup({
              featureGroupRef,
              feature,
              name,
            });
        } catch (e) {
          console.warn("No se pudo cargar geocerca", name, e);
        }
      }
      if (shown > 0 && zoom && mapRef.current) {
        try {
          const bounds = featureGroupRef.current?.getBounds();
          if (bounds?.isValid()) mapRef.current.fitBounds(bounds.pad(0.2));
        } catch {}
      }
      if (!shown) alert("No se pudo mostrar ninguna geometría.");
    },
    [supabaseClient, clearCanvas]
  );

  const toggleSelected = useCallback((nombre) => {
    setSelectedNames((prev) => {
      const next = new Set(prev);
      if (next.has(nombre)) next.delete(nombre);
      else next.add(nombre);
      return next;
    });
  }, []);

  const handleShowSelected = useCallback(async () => {
    if (!selectedNames.size) {
      alert("Selecciona al menos una geocerca en el listado.");
      return;
    }
    await drawGeofences(Array.from(selectedNames), {
      append: false,
      zoom: true,
    });
  }, [selectedNames, drawGeofences]);

  const handleShowAll = useCallback(async () => {
    if (!geofenceList.length) {
      alert("No hay geocercas guardadas.");
      return;
    }
    await drawGeofences(
      geofenceList.map((g) => g.nombre),
      { append: false, zoom: true }
    );
  }, [geofenceList, drawGeofences]);

  const handleDeleteSelected = useCallback(async () => {
    if (!selectedNames.size) {
      alert("Selecciona al menos una geocerca en el listado.");
      return;
    }
    if (
      !window.confirm(
        "¿Eliminar las geocercas seleccionadas? Esta acción es irreversible."
      )
    )
      return;
    const items = geofenceList.filter((g) => selectedNames.has(g.nombre));
    try {
      const deletedCount = await deleteGeofences({
        items,
        supabase: supabaseClient,
      });
      alert(`🗑️ Eliminadas: ${deletedCount}`);
      setSelectedNames(new Set());
      await refreshGeofenceList();
      clearCanvas();
    } catch (e) {
      alert(`❌ No se pudo eliminar: ${e.message || e}`);
    }
  }, [
    selectedNames,
    geofenceList,
    supabaseClient,
    refreshGeofenceList,
    clearCanvas,
  ]);

  const pointStyle = useMemo(
    () => ({
      pointToLayer: (feature, latlng) =>
        L.circleMarker(latlng, { radius: 4, weight: 1 }),
      onEachFeature: (feature, layer) => {
        const p = feature?.properties || {};
        const label = Object.keys(p).length ? JSON.stringify(p) : "Punto";
        layer.bindTooltip(label, { direction: "top" });
      },
    }),
    []
  );

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "300px 1fr",
        height: "100%",
        background: "#0b1220",
        color: "#e5e7eb",
      }}
    >
      {/* Sidebar oscuro legible */}
      <aside
        style={{
          background: "#0f172a",
          color: "#e5e7eb",
          borderRight: "1px solid #1f2937",
          padding: 12,
          overflow: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 10,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 16, color: "#f9fafb" }}>
            Geocercas
          </h3>
          <button
            onClick={refreshGeofenceList}
            style={smBtnDark}
            title="Actualizar listado"
          >
            ↻
          </button>
        </div>

        {geofenceList.length === 0 ? (
          <div style={{ fontSize: 13, color: "#9ca3af" }}>
            No hay geocercas guardadas.
          </div>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {geofenceList.map((g) => (
              <li
                key={g.id || g.key || g.nombre}
                style={{
                  border: "1px solid #374151",
                  borderRadius: 10,
                  padding: 10,
                  marginBottom: 10,
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  background: "#111827",
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedNames.has(g.nombre)}
                  onChange={() => toggleSelected(g.nombre)}
                  style={{ transform: "scale(1.1)" }}
                  title="Seleccionar para mostrar o eliminar"
                />
                <div
                  style={{ display: "grid", lineHeight: 1.25, cursor: "pointer" }}
                  title="Doble click: mostrar SOLO esta geocerca"
                  onDoubleClick={async () => {
                    await drawGeofences([g.nombre], {
                      append: false,
                      zoom: true,
                    });
                  }}
                >
                  <span
                    style={{ fontWeight: 700, color: "#f3f4f6" }}
                  >
                    {g.nombre}
                  </span>
                  <span style={{ fontSize: 12, color: "#9ca3af" }}>
                    {g.source === "supabase" ? "Supabase" : "Local"}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
          <button
            onClick={handleShowSelected}
            style={{ ...btnDark, background: "#2563eb" }}
          >
            Mostrar seleccionadas
          </button>
          <button onClick={handleShowAll} style={btnDark}>
            Mostrar todas
          </button>
          <button
            onClick={handleDeleteSelected}
            style={{ ...btnDark, background: "#ef4444" }}
          >
            Eliminar seleccionadas
          </button>
          <button onClick={clearCanvas} style={btnDark}>
            Limpiar dibujos (canvas)
          </button>
        </div>
      </aside>

      {/* Contenido principal */}
      <div style={{ display: "grid", gridTemplateRows: "auto 1fr" }}>
        {/* Top bar oscuro */}
        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            padding: "10px 12px",
            borderBottom: "1px solid #1f2937",
            background: "#0f172a",
            position: "sticky",
            top: 0,
            zIndex: 1000,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 18, color: "#f9fafb" }}>
            Nueva Geocerca
          </h2>

          <input
            type="text"
            value={geofenceName}
            onChange={(e) => setGeofenceName(e.target.value)}
            placeholder="Nombre de la geocerca"
            style={inputDark}
          />

          <button onClick={openCoordModal} style={btnDark}>
            Dibujar por coordenadas
          </button>

          <button
            onClick={handleSave}
            style={{ ...btnDark, background: "#16a34a" }}
          >
            Guardar geocerca
          </button>

          <div
            style={{
              marginLeft: "auto",
              fontSize: 13,
              color: "#d1d5db",
            }}
          >
            {DATA_SOURCE && (
              <>
                {loadingDataset && "Cargando dataset…"}
                {!loadingDataset &&
                  dataset &&
                  `Puntos: ${dataset.features?.length ?? 0}`}
                {datasetError && (
                  <span style={{ color: "#fca5a5" }}>
                    {" "}
                    · {datasetError}
                  </span>
                )}
                <span style={{ marginLeft: 12, opacity: 0.7 }}>
                  Fuente: {DATA_SOURCE}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Mapa */}
        <div style={{ position: "relative" }}>
          <MapContainer
            center={[-1.8312, -78.1834]}
            zoom={6}
            style={{ height: "calc(100vh - 56px)", width: "100%" }}
            whenReady={(e) => onMapReady(e.target)}
          >
            <TileLayer
              attribution="&copy; OpenStreetMap contributors"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {dataset && <GeoJSON data={dataset} {...pointStyle} />}
            <FeatureGroup ref={featureGroupRef} />
            <GeomanControls
              featureGroupRef={featureGroupRef}
              selectedLayerRef={selectedLayerRef}
              lastCreatedLayerRef={lastCreatedLayerRef}
              getCurrentName={() => geofenceName.trim()}
            />
          </MapContainer>

          {/* Coordenadas en vivo */}
          <div style={coordOverlayDark} title="Coordenadas del cursor">
            {cursorLatLng
              ? `Lat: ${cursorLatLng.lat.toFixed(
                  6
                )} · Lng: ${cursorLatLng.lng.toFixed(6)}`
              : "Mueve el cursor sobre el mapa"}
          </div>
        </div>
      </div>

      {/* Modal coordenadas - oscuro */}
      {coordModalOpen && (
        <div style={modalBackdropDark}>
          <div style={modalCardDark}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <h3
                style={{
                  margin: 0,
                  fontSize: 16,
                  color: "#f3f4f6",
                }}
              >
                Dibujar polígono por coordenadas
              </h3>
              <button onClick={closeCoordModal} style={smBtnDark}>
                ✕
              </button>
            </div>
            <div
              style={{
                fontSize: 13,
                marginBottom: 6,
                color: "#d1d5db",
              }}
            >
              Nombre actual:{" "}
              <b style={{ color: "#f9fafb" }}>{geofenceName || "—"}</b>
            </div>
            <p
              style={{
                marginTop: 0,
                fontSize: 13,
                color: "#9ca3af",
              }}
            >
              Ingresa una coordenada por línea. Formato:{" "}
              <code>lat,lng</code> o <code>lat lng</code>. Mínimo 3 puntos.
            </p>
            <textarea
              value={coordText}
              onChange={(e) => setCoordText(e.target.value)}
              placeholder={`-1.234567, -78.345678\n-1.240001, -78.350001\n-1.239000, -78.360000`}
              style={textareaDark}
            />
            <div
              style={{
                display: "flex",
                gap: 8,
                marginTop: 10,
              }}
            >
              <button
                onClick={applyCoordinates}
                style={{ ...btnDark, background: "#2563eb" }}
              >
                Crear polígono
              </button>
              <button onClick={closeCoordModal} style={btnDark}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== Estilos Dark (alto contraste) =====
const btnDark = {
  fontSize: 13,
  padding: "8px 12px",
  border: "1px solid #374151",
  borderRadius: 8,
  background: "#1f2937",
  color: "#e5e7eb",
  cursor: "pointer",
};

const smBtnDark = {
  fontSize: 12,
  padding: "6px 8px",
  border: "1px solid #374151",
  borderRadius: 8,
  background: "#111827",
  color: "#e5e7eb",
  cursor: "pointer",
};

const inputDark = {
  minWidth: 240,
  height: 34,
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid #374151",
  background: "#111827",
  color: "#f3f4f6",
  outline: "none",
};

const textareaDark = {
  width: "100%",
  height: 160,
  fontFamily: "monospace",
  fontSize: 13,
  padding: 8,
  border: "1px solid #374151",
  borderRadius: 8,
  boxSizing: "border-box",
  resize: "vertical",
  background: "#0b1220",
  color: "#e5e7eb",
};

const modalBackdropDark = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.55)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 2000,
};

const modalCardDark = {
  width: 540,
  maxWidth: "92vw",
  background: "#0f172a",
  color: "#e5e7eb",
  borderRadius: 12,
  padding: 16,
  boxShadow: "0 10px 25px rgba(0,0,0,0.3)",
  border: "1px solid #1f2937",
};

const coordOverlayDark = {
  position: "absolute",
  left: 10,
  bottom: 10,
  padding: "6px 10px",
  fontSize: 12,
  borderRadius: 8,
  background: "rgba(15,23,42,0.92)",
  border: "1px solid #374151",
  boxShadow: "0 2px 6px rgba(0,0,0,0.4)",
  color: "#e5e7eb",
  pointerEvents: "none",
  zIndex: 1500,
};
