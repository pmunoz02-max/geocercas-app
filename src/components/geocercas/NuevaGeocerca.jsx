// src/components/geocercas/NuevaGeocerca.jsx
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
  useMapEvents,
} from "react-leaflet";

import "leaflet/dist/leaflet.css";
import L from "leaflet";

import { GeomanControls } from "react-leaflet-geoman-v2";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";

import { supabase } from "../../supabaseClient";
import { useAuth } from "../../context/AuthContext.jsx";
import { useTranslation } from "react-i18next";

const DATA_SOURCE = null; // 'geojson' | 'csv' | 'supabase' | null
const GEOJSON_URL = "/data/mapa_corto_214.geojson";
const CSV_URL = "/data/mapa_corto_214.csv";

const SUPABASE_POINTS_TABLE = "puntos_mapa_corto";
const SUPABASE_GEOFENCES_TABLE = "geocercas";

/* ----------------- Utils dataset externos ----------------- */

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

async function loadShortMap({ source = DATA_SOURCE, supabaseClient = null }) {
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
    if (!supabaseClient)
      throw new Error("Supabase no disponible para puntos del mapa");
    const { data, error } = await supabaseClient
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

/* ----------------- Utils geocercas ----------------- */

async function listGeofences({ supabaseClient = null, orgId = null }) {
  const list = [];

  // 🔒 Si no hay organización, no cargamos nada de Supabase
  if (supabaseClient && orgId) {
    // Confiamos en RLS + filtro explícito por org_id
    const { data, error } = await supabaseClient
      .from(SUPABASE_GEOFENCES_TABLE)
      .select("id, nombre")
      .eq("org_id", orgId)
      .order("nombre", { ascending: true });

    if (!error && data) {
      data.forEach((r) =>
        list.push({ id: r.id, nombre: r.nombre, source: "supabase" })
      );
    }
  }

  if (typeof window !== "undefined") {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k.startsWith("geocerca_")) {
        try {
          const raw = localStorage.getItem(k);
          const obj = JSON.parse(raw || "{}");
          const nombre = obj?.nombre || k.replace(/^geocerca_/, "");
          list.push({
            key: k,
            nombre,
            source: "local",
          });
        } catch {
          // ignore
        }
      }
    }
  }

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

async function deleteGeofences({ items, supabaseClient = null }) {
  let deleted = 0;

  const supaTargets = items.filter((x) => x.source === "supabase");
  if (supabaseClient && supaTargets.length) {
    const nombres = supaTargets.map((x) => x.nombre);
    // RLS se encarga de que solo borre las de la org del usuario
    const { error, count } = await supabaseClient
      .from(SUPABASE_GEOFENCES_TABLE)
      .delete({ count: "exact" })
      .in("nombre", nombres);
    if (error) throw error;
    deleted += count || 0;
  }

  const localTargets = items.filter((x) => x.source === "local");
  if (typeof window !== "undefined") {
    for (const it of localTargets) {
      const key = it.key || `geocerca_${it.nombre}`;
      if (localStorage.getItem(key) !== null) {
        localStorage.removeItem(key);
        deleted += 1;
      }
    }
  }

  return deleted;
}

async function loadGeofenceGeometryByName({ name, supabaseClient = null }) {
  if (supabaseClient) {
    const { data, error } = await supabaseClient
      .from(SUPABASE_GEOFENCES_TABLE)
      .select("geojson")
      .eq("nombre", name)
      .maybeSingle();
    if (error) throw error;
    if (data?.geojson) return data.geojson;
  }

  if (typeof window !== "undefined") {
    const key = `geocerca_${name}`;
    const raw = localStorage.getItem(key);
    if (raw) {
      try {
        const obj = JSON.parse(raw);
        if (obj?.geojson) return obj.geojson;
        if (obj?.geometry) {
          return {
            type: "Feature",
            properties: obj.props || {},
            geometry: obj.geometry,
          };
        }
      } catch {
        // ignore
      }
    }
  }

  return null;
}

/* ----------------- Helpers GeoJSON ----------------- */

function approximateArea(geometry) {
  if (!geometry) return 0;
  if (
    geometry.type === "Polygon" &&
    Array.isArray(geometry.coordinates) &&
    geometry.coordinates.length
  ) {
    const ring = geometry.coordinates[0];
    let sum = 0;
    for (let i = 0; i < ring.length; i++) {
      const [x1, y1] = ring[i];
      const [x2, y2] = ring[(i + 1) % ring.length];
      sum += x1 * y2 - x2 * y1;
    }
    return Math.abs(sum) / 2;
  }
  if (
    geometry.type === "MultiPolygon" &&
    Array.isArray(geometry.coordinates)
  ) {
    return geometry.coordinates
      .map((poly) => ({
        type: "Polygon",
        coordinates: poly[0] ? [poly[0]] : poly,
      }))
      .reduce((acc, g) => acc + approximateArea(g), 0);
  }
  return 0;
}

function primaryFeatureFromGeoJSON(geojson) {
  if (!geojson) return null;

  if (geojson.type === "Feature") return geojson;

  if (
    geojson.type === "FeatureCollection" &&
    Array.isArray(geojson.features) &&
    geojson.features.length
  ) {
    let best = geojson.features[0];
    for (const f of geojson.features) {
      if (!f?.geometry) continue;
      const areaBest = approximateArea(best.geometry);
      const areaNew = approximateArea(f.geometry);
      if (areaNew > areaBest) best = f;
    }
    return best;
  }

  return null;
}

function addSingleFeatureToFeatureGroup({ featureGroupRef, feature, name }) {
  if (!featureGroupRef.current || !feature?.geometry) return 0;

  const layer = L.geoJSON(feature, {
    style: {
      color: "#0ea5e9",
      weight: 2,
      fillColor: "#38bdf8",
      fillOpacity: 0.15,
    },
  });

  layer.eachLayer((l) => {
    l.bindTooltip(name, {
      permanent: true,
      direction: "center",
      className: "geofence-label",
    });
  });

  featureGroupRef.current.addLayer(layer);
  return 1;
}

/* ----------------- Auxiliares ----------------- */

function fitFeatureGroup(map, featureGroupRef, { padding = [20, 20] } = {}) {
  if (!map || !featureGroupRef.current) return;
  const fg = featureGroupRef.current;
  const bounds = fg.getBounds();
  if (bounds && bounds.isValid()) {
    map.fitBounds(bounds, { padding });
  }
}

function CursorPos({ setCursorLatLng }) {
  useMapEvents({
    mousemove(e) {
      setCursorLatLng({
        lat: e.latlng.lat,
        lng: e.latlng.lng,
      });
    },
  });
  return null;
}

/* ----------------- Componente principal ----------------- */

function NuevaGeocerca({ supabaseClient = supabase }) {
  const { currentOrg } = useAuth();
  const { t } = useTranslation();

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

  /* ---- Cargar dataset externo opcional ---- */
  useEffect(() => {
    let isMounted = true;
    if (!DATA_SOURCE) {
      setLoadingDataset(false);
      setDataset(null);
      setDatasetError(null);
      return;
    }

    async function loadData() {
      setLoadingDataset(true);
      setDatasetError(null);
      try {
        const data = await loadShortMap({ source: DATA_SOURCE, supabaseClient });
        if (!isMounted) return;
        setDataset(data);
      } catch (e) {
        console.error("Error cargando dataset externo:", e);
        if (!isMounted) return;
        setDatasetError(e);
      } finally {
        if (isMounted) setLoadingDataset(false);
      }
    }

    loadData();
    return () => {
      isMounted = false;
    };
  }, [supabaseClient]);

  /* ---- Listado de geocercas ---- */
  const refreshGeofenceList = useCallback(async () => {
    try {
      // Si el usuario aún no tiene organización activa, lista vacía
      if (!currentOrg?.id) {
        setGeofenceList([]);
        return;
      }
      const list = await listGeofences({
        supabaseClient,
        orgId: currentOrg.id,
      });
      setGeofenceList(list);
    } catch (err) {
      console.warn("[NuevaGeocerca] error al refrescar geofences:", err);
      setGeofenceList([]);
    }
  }, [supabaseClient, currentOrg]);

  useEffect(() => {
    refreshGeofenceList();
  }, [refreshGeofenceList]);

  /* ---- Cuando se crea el mapa ---- */
  const onMapReady = useCallback((map) => {
    mapRef.current = map;
  }, []);

  /* ---- Operaciones sobre FeatureGroup ---- */

  const clearCanvas = useCallback(() => {
    featureGroupRef.current?.clearLayers();
    selectedLayerRef.current = null;
    lastCreatedLayerRef.current = null;
  }, []);

  const drawGeofences = useCallback(
    ({ names, append = false, zoom = true } = {}) => {
      if (!featureGroupRef.current) return 0;
      featureGroupRef.current.clearLayers();
      selectedLayerRef.current = null;
      lastCreatedLayerRef.current = null;
      if (!names || !names.length) return 0;

      let shown = 0;

      const supaNames = geofenceList
        .filter((g) => g.source === "supabase" && names.includes(g.nombre))
        .map((g) => g.nombre);

      const localNames = geofenceList
        .filter((g) => g.source === "local" && names.includes(g.nombre))
        .map((g) => g.nombre);

      const doDraw = async () => {
        if (supaNames.length && supabaseClient) {
          for (const name of supaNames) {
            try {
              const geojson = await loadGeofenceGeometryByName({
                name,
                supabaseClient,
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
        }

        if (typeof window !== "undefined") {
          for (const name of localNames) {
            try {
              const geojson = await loadGeofenceGeometryByName({
                name,
                supabaseClient: null,
              });
              const feature = primaryFeatureFromGeoJSON(geojson);
              if (feature)
                shown += addSingleFeatureToFeatureGroup({
                  featureGroupRef,
                  feature,
                  name,
                });
            } catch (e) {
              console.warn("No se pudo cargar geocerca local", name, e);
            }
          }
        }

        if (zoom && mapRef.current) {
          fitFeatureGroup(mapRef.current, featureGroupRef, {
            padding: [40, 40],
          });
        }
      };

      doDraw();
      return shown;
    },
    [geofenceList, supabaseClient]
  );

  const saveGeofenceCollection = useCallback(
    async ({ name }) => {
      let layerToSave = selectedLayerRef.current || lastCreatedLayerRef.current;
      const layers = [];
      featureGroupRef.current?.eachLayer((l) => layers.push(l));

      if (!layerToSave) {
        if (layers.length === 1) layerToSave = layers[0];
        else throw new Error(t("geocercas.errorSelectOneGeometry"));
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
        alert(t("geocercas.errorDuplicateName"));
        return { ok: false, duplicate: true };
      }

      if (supabaseClient) {
        let created_by = null;
        try {
          const { data } = await supabaseClient.auth.getUser();
          created_by = data?.user?.id || null;
        } catch {}

        const fc = { type: "FeatureCollection", features: [feature] };

        const payload = {
          nombre: name,
          geojson: fc,
          org_id: currentOrg?.id ?? null, // 👈 clave para RLS + multi-org
          created_by: created_by ?? null,
        };

        const { data, error } = await supabaseClient
          .from(SUPABASE_GEOFENCES_TABLE)
          .insert(payload)
          .select("id")
          .single();

        if (error) {
          console.error("Error guardando geocerca en Supabase:", error);
          throw error;
        }

        return { ok: true, via: "supabase", id: data?.id };
      }

      if (typeof window !== "undefined") {
        const key = `geocerca_${name}`;
        const existing = localStorage.getItem(key);
        if (existing) {
          throw new Error(t("geocercas.errorDuplicateName"));
        }
        const fc = { type: "FeatureCollection", features: [feature] };
        const payload = {
          nombre: name,
          geojson: fc,
          props: { source: "UI", version: 3 },
        };
        localStorage.setItem(key, JSON.stringify(payload));
        return { ok: true, via: "localStorage", key };
      }

      return { ok: false };
    },
    [geofenceList, supabaseClient, t, currentOrg]
  );

  /* ---- Handlers UI ---- */

  const handleSave = useCallback(async () => {
    const name = geofenceName.trim();
    if (!name) {
      alert(t("geocercas.errorNameRequired"));
      return;
    }
    try {
      const result = await saveGeofenceCollection({ name });
      if (result?.ok) {
        alert(t("geocercas.saveSuccess", { name }));
        await refreshGeofenceList();
      }
    } catch (e) {
      console.error("Error en handleSave geocerca:", e);
      const rawMsg = e?.message || String(e);
      const translated = t("geocercas.errorSave", { error: rawMsg });
      alert(translated === "geocercas.errorSave" ? rawMsg : translated);
    }
  }, [geofenceName, saveGeofenceCollection, refreshGeofenceList, t]);

  const openCoordModal = useCallback(() => {
    setCoordText("");
    setCoordModalOpen(true);
  }, []);
  const closeCoordModal = useCallback(() => {
    setCoordModalOpen(false);
  }, []);

  const handleCoordTextChange = useCallback((e) => {
    setCoordText(e.target.value);
  }, []);

  const handleDrawFromCoords = useCallback(() => {
    const text = coordText.trim();
    if (!text) {
      return;
    }
    const parts = text.split(/[,;\s]+/).filter(Boolean);
    if (parts.length < 2) {
      alert(t("geocercas.errorCoordsMin"));
      return;
    }
    const lat = parseFloat(parts[0].replace(",", "."));
    const lng = parseFloat(parts[1].replace(",", "."));
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      alert(t("geocercas.errorCoordsInvalid"));
      return;
    }

    clearCanvas();

    const map = mapRef.current;
    if (!map) return;

    const layer = L.circle([lat, lng], {
      radius: 30,
      color: "#22c55e",
      fillColor: "#22c55e",
      fillOpacity: 0.3,
    });

    if (!featureGroupRef.current) {
      featureGroupRef.current = L.featureGroup().addTo(map);
    }
    featureGroupRef.current.addLayer(layer);
    selectedLayerRef.current = layer;
    lastCreatedLayerRef.current = layer;

    map.setView([lat, lng], 19);

    setCoordModalOpen(false);
    setCoordText("");
  }, [coordText, clearCanvas, t]);

  const handleSelectGeofence = useCallback(
    (nombre) => {
      const newSet = new Set(selectedNames);
      if (newSet.has(nombre)) newSet.delete(nombre);
      else newSet.add(nombre);
      setSelectedNames(newSet);
    },
    [selectedNames]
  );

  const handleShowSelected = useCallback(async () => {
    if (!selectedNames.size) {
      alert(t("geocercas.errorSelectAtLeastOne"));
      return;
    }
    const names = Array.from(selectedNames);
    drawGeofences({ names, append: false, zoom: true });
  }, [selectedNames, drawGeofences, t]);

  const handleShowAll = useCallback(() => {
    const names = geofenceList.map((g) => g.nombre);
    drawGeofences({ names, append: false, zoom: true });
  }, [geofenceList, drawGeofences]);

  const handleDeleteSelected = useCallback(
    async () => {
      if (!selectedNames.size) {
        alert(t("geocercas.errorSelectAtLeastOne"));
        return;
      }
      if (!window.confirm(t("geocercas.deleteConfirm"))) return;
      const items = geofenceList.filter((g) => selectedNames.has(g.nombre));
      try {
        const deletedCount = await deleteGeofences({
          items,
          supabaseClient,
        });
        alert(t("geocercas.deletedCount", { count: deletedCount }));
        setSelectedNames(new Set());
        await refreshGeofenceList();
        clearCanvas();
      } catch (e) {
        alert(t("geocercas.errorDelete", { error: e?.message || String(e) }));
      }
    },
    [selectedNames, geofenceList, supabaseClient, refreshGeofenceList, clearCanvas, t]
  );

  const pointStyle = useMemo(
    () => ({
      pointToLayer: (feature, latlng) =>
        L.circleMarker(latlng, {
          radius: 4,
          fillColor: "#22c55e",
          color: "#064e3b",
          weight: 1,
          opacity: 1,
          fillOpacity: 0.8,
        }),
    }),
    []
  );

  /* ----------------- RENDER ----------------- */

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-140px)]">
      {/* TOP BAR */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-100">
            {t("geocercas.titleNew")}
          </h1>
          <p className="text-xs text-slate-300">
            {t("geocercas.subtitleNew")}
          </p>
        </div>

        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2">
          <input
            type="text"
            className="px-4 py-2.5 rounded-lg bg-slate-900 border border-emerald-400/60 
                       text-sm md:text-base text-white placeholder:text-slate-300 
                       font-semibold shadow-sm focus:outline-none focus:ring-2 
                       focus:ring-emerald-400"
            placeholder={t("geocercas.placeholderName")}
            value={geofenceName}
            onChange={(e) => setGeofenceName(e.target.value)}
          />
          <button
            onClick={openCoordModal}
            className="px-4 py-2.5 rounded-lg text-sm md:text-base font-semibold bg-slate-800 text-slate-50 border border-slate-600 shadow-sm hover:bg-slate-700 active:bg-slate-800"
          >
            {t("geocercas.buttonDrawByCoords")}
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2.5 rounded-lg text-sm md:text-base font-semibold bg-emerald-600 text-white shadow-md hover:bg-emerald-500 active:bg-emerald-700"
          >
            {t("geocercas.buttonSave")}
          </button>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* PANEL IZQUIERDO */}
        <div className="bg-slate-900/80 rounded-xl border border-slate-700/80 p-3 flex flex-col">
          <h2 className="text-sm font-semibold text-slate-100 mb-2">
            {t("geocercas.panelTitle")}
          </h2>

          <div className="flex-1 overflow-auto space-y-1 pr-1">
            {geofenceList.length === 0 && (
              <div className="text-xs text-slate-400">
                {t("geocercas.noGeofences")}
              </div>
            )}
            {geofenceList.map((g) => (
              <label
                key={`${g.source}-${g.nombre}`}
                className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-slate-800 border border-transparent hover:border-slate-600"
              >
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedNames.has(g.nombre)}
                    onChange={() => handleSelectGeofence(g.nombre)}
                  />
                  <span className="text-xs text-slate-100">{g.nombre}</span>
                </div>
                <span className="text-[10px] uppercase tracking-wide text-slate-500">
                  {g.source === "supabase"
                    ? t("geocercas.sourceSupabase")
                    : t("geocercas.sourceLocal")}
                </span>
              </label>
            ))}
          </div>

          <div className="mt-3 flex flex-col gap-2">
            <button
              onClick={handleShowSelected}
              className="w-full px-3 py-1.5 rounded-md text-xs font-semibold bg-sky-600 text-white hover:bg-sky-500"
            >
              {t("geocercas.buttonShowSelected")}
            </button>
            <button
              onClick={handleShowAll}
              className="w-full px-3 py-1.5 rounded-md text-xs font-semibold bg-slate-800 text-slate-100 hover:bg-slate-700"
            >
              {t("geocercas.buttonShowAll")}
            </button>
            <button
              onClick={handleDeleteSelected}
              className="w-full px-3 py-1.5 rounded-md text-xs font-semibold bg-red-600 text-white hover:bg-red-500"
            >
              {t("geocercas.buttonDeleteSelected")}
            </button>
            <button
              onClick={clearCanvas}
              className="w-full px-3 py-1.5 rounded-md text-xs font-medium bg-slate-800 text-slate-200 hover:bg-slate-700"
            >
              {t("geocercas.buttonClearCanvas")}
            </button>
          </div>
        </div>

        {/* MAPA */}
        <div className="lg:col-span-3 bg-slate-900/80 rounded-xl overflow-hidden border border-slate-700/80 relative">
          <MapContainer
            center={[-0.2, -78.5]}
            zoom={8}
            scrollWheelZoom={true}
            style={{ height: "100%", width: "100%" }}
            whenCreated={onMapReady}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {dataset && (
              <GeoJSON data={dataset} {...pointStyle} key="points-layer" />
            )}

            {/* Lat/Lng vivos */}
            <CursorPos setCursorLatLng={setCursorLatLng} />

            <FeatureGroup
              ref={(fg) => {
                featureGroupRef.current = fg;
              }}
            >
              <GeomanControls
                options={{
                  position: "topleft",
                  drawMarker: false,
                  drawCircleMarker: false,
                  drawPolyline: false,
                  drawText: false,
                  drawRectangle: true,
                  drawPolygon: true,
                  drawCircle: true,
                  editMode: true,
                  dragMode: true,
                  removalMode: true,
                }}
                globalOptions={{
                  continueDrawing: false,
                  editable: true,
                }}
                onCreate={(e) => {
                  const layer = e.layer;
                  selectedLayerRef.current = layer;
                  lastCreatedLayerRef.current = layer;
                }}
                onEdit={(e) => {
                  if (e.layer) {
                    selectedLayerRef.current = e.layer;
                    lastCreatedLayerRef.current = e.layer;
                  }
                }}
                onUpdate={(e) => {
                  if (e.layer) {
                    selectedLayerRef.current = e.layer;
                    lastCreatedLayerRef.current = e.layer;
                  }
                }}
              />
            </FeatureGroup>
          </MapContainer>

          {/* Cuadro de coordenadas SIEMPRE visible, encima del mapa */}
          <div className="absolute right-3 top-3 z-[9999] px-3 py-1.5 rounded-md bg-black/70 text-[11px] text-slate-50 font-mono pointer-events-none">
            {cursorLatLng ? (
              <>
                <span>Lat: {cursorLatLng.lat.toFixed(6)}</span>
                <span className="ml-2">
                  Lng: {cursorLatLng.lng.toFixed(6)}
                </span>
              </>
            ) : (
              <span>{t("geocercas.cursorHint")}</span>
            )}
          </div>
        </div>
      </div>

      {/* Modal coordenadas */}
      {coordModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[10000]">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 w-full max-w-md space-y-3 z-[10001]">
            <h2 className="text-sm font-semibold text-slate-100 mb-1">
              {t("geocercas.modalTitle")}
            </h2>
            <p className="text-xs text-slate-400">
              {t("geocercas.modalInstruction")}
              <br />
              <span className="font-mono text-[11px]">
                -0.180653, -78.467838
              </span>
            </p>
            <textarea
              rows={3}
              className="w-full rounded-md bg-slate-950 border border-slate-700 text-xs text-slate-100 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              value={coordText}
              onChange={handleCoordTextChange}
            />
            <div className="flex justify-end gap-2 mt-2">
              <button
                onClick={closeCoordModal}
                className="px-3 py-1.5 rounded-md text-xs font-medium bg-slate-800 text-slate-200 hover:bg-slate-700"
              >
                {t("geocercas.modalCancel")}
              </button>
              <button
                onClick={handleDrawFromCoords}
                className="px-3 py-1.5 rounded-md text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-500"
              >
                {t("geocercas.modalDraw")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default NuevaGeocerca;
