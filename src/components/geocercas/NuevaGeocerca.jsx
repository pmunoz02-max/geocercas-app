import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  FeatureGroup,
  Pane,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";

import "leaflet/dist/leaflet.css";

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
  const lines = String(text || "").split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const latKey = headers.find((h) => ["lat", "latitude", "y"].includes(h)) || "lat";
  const lonKey = headers.find((h) => ["lon", "lng", "long", "longitude", "x"].includes(h)) || "lon";

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
    features: (rows || []).map((r, i) => ({
      type: "Feature",
      properties: { ...(r || {}), _idx: i },
      geometry: { type: "Point", coordinates: [Number(r.lon), Number(r.lat)] },
    })),
  };
}

async function loadShortMap({ source = DATA_SOURCE, supabaseClient = null }) {
  if (!source) return null;

  if (source === "geojson") {
    const res = await fetch(GEOJSON_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`No se pudo cargar ${GEOJSON_URL}`);
    const data = await res.json();
    if (!data || data.type !== "FeatureCollection") throw new Error("GeoJSON inválido");
    return data;
  }

  if (source === "csv") {
    const res = await fetch(CSV_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`No se pudo cargar ${CSV_URL}`);
    const text = await res.text();
    return pointsToFeatureCollection(parseCSV(text));
  }

  if (source === "supabase") {
    if (!supabaseClient) throw new Error("Supabase no disponible");
    const { data, error } = await supabaseClient.from(SUPABASE_POINTS_TABLE).select("*").limit(10000);
    if (error) throw error;

    const rows = (data || [])
      .map((r, i) => ({ ...r, lat: parseFloat(r.lat), lon: parseFloat(r.lon), _idx: i }))
      .filter((r) => !Number.isNaN(r.lat) && !Number.isNaN(r.lon));

    return pointsToFeatureCollection(rows);
  }

  throw new Error("DATA_SOURCE no reconocido");
}

/* ----------------- Utils geocercas (lista/borrar) ----------------- */
async function listGeofences({ supabaseClient = null, orgId = null }) {
  const list = [];

  if (supabaseClient && orgId) {
    const { data, error } = await supabaseClient
      .from(SUPABASE_GEOFENCES_TABLE)
      .select("id, nombre")
      .eq("org_id", orgId)
      .order("nombre", { ascending: true });

    if (!error && data) data.forEach((r) => list.push({ id: r.id, nombre: r.nombre, source: "supabase" }));
  }

  if (typeof window !== "undefined") {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k.startsWith("geocerca_")) {
        try {
          const obj = JSON.parse(localStorage.getItem(k) || "{}");
          const nombre = obj?.nombre || k.replace(/^geocerca_/, "");
          list.push({ key: k, nombre, source: "local" });
        } catch {}
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

  const supaTargets = (items || []).filter((x) => x.source === "supabase");
  if (supabaseClient && supaTargets.length) {
    const nombres = supaTargets.map((x) => x.nombre);
    const { error, count } = await supabaseClient
      .from(SUPABASE_GEOFENCES_TABLE)
      .delete({ count: "exact" })
      .in("nombre", nombres);
    if (error) throw error;
    deleted += count || 0;
  }

  const localTargets = (items || []).filter((x) => x.source === "local");
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

/* ----------------- Lat/Lng vivos ----------------- */
function CursorPosLive({ setCursorLatLng }) {
  useMapEvents({
    mousemove(e) {
      setCursorLatLng({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}


/* ----------------- Bridge Geoman (captura pm:* y asegura refs) ----------------- */
function GeomanBridge({ onCreateLayer, onUpdateLayer, onRemoveLayer }) {
  useMapEvents({
    "pm:create": (e) => e?.layer && onCreateLayer?.(e.layer, e),
    "pm:update": (e) => e?.layer && onUpdateLayer?.(e.layer, e),
    "pm:edit": (e) => {
      const lyr = e?.layer || null;
      if (lyr) onUpdateLayer?.(lyr, e);
      const layers = e?.layers;
      if (layers && typeof layers.eachLayer === "function") {
        layers.eachLayer((l) => onUpdateLayer?.(l, e));
      }
    },
    "pm:remove": (e) => e?.layer && onRemoveLayer?.(e.layer, e),
  });
  return null;
}

/* ----------------- Coordenadas → Feature ----------------- */
function parsePairs(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const pairs = [];

  for (const line of lines) {
    const parts = line.split(/[,;\s]+/).filter(Boolean);
    if (parts.length < 2) continue;
    const lat = parseFloat(String(parts[0]).replace(",", "."));
    const lng = parseFloat(String(parts[1]).replace(",", "."));
    if (!Number.isNaN(lat) && !Number.isNaN(lng)) pairs.push([lng, lat]); // GeoJSON order
  }

  if (!pairs.length) {
    const parts = String(text || "").trim().split(/[,;\s]+/).filter(Boolean);
    if (parts.length >= 2) {
      const lat = parseFloat(String(parts[0]).replace(",", "."));
      const lng = parseFloat(String(parts[1]).replace(",", "."));
      if (!Number.isNaN(lat) && !Number.isNaN(lng)) pairs.push([lng, lat]);
    }
  }

  return pairs;
}

function squareFromPoint([lng, lat], d = 0.00015) {
  return [
    [lng - d, lat + d],
    [lng + d, lat + d],
    [lng + d, lat - d],
    [lng - d, lat - d],
    [lng - d, lat + d],
  ];
}

function rectFromTwoPoints([lng1, lat1], [lng2, lat2]) {
  const minLng = Math.min(lng1, lng2);
  const maxLng = Math.max(lng1, lng2);
  const minLat = Math.min(lat1, lat2);
  const maxLat = Math.max(lat1, lat2);
  return [
    [minLng, maxLat],
    [maxLng, maxLat],
    [maxLng, minLat],
    [minLng, minLat],
    [minLng, maxLat],
  ];
}


function pickLastDrawableLayer(layers) {
  const arr = (layers || []).filter(Boolean);
  if (!arr.length) return null;

  const polys = arr.filter((l) => l instanceof L.Polygon);
  if (polys.length) return polys[polys.length - 1];

  const circles = arr.filter((l) => l instanceof L.Circle);
  if (circles.length) return circles[circles.length - 1];

  const any = arr.filter((l) => typeof l.toGeoJSON === "function");
  return any[any.length - 1] || null;
}

function featureFromCoords(pairs) {
  let coords;
  if (pairs.length === 1) coords = squareFromPoint(pairs[0]);
  else if (pairs.length === 2) coords = rectFromTwoPoints(pairs[0], pairs[1]);
  else {
    coords = [...pairs];
    const first = coords[0];
    const last = coords[coords.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) coords.push(first);
  }

  return {
    type: "Feature",
    properties: { source: "coords", createdAt: new Date().toISOString() },
    geometry: { type: "Polygon", coordinates: [coords] },
  };
}


/* ----------------- Utils GeoJSON ----------------- */
function normalizeGeojson(geo) {
  if (!geo) return null;
  if (typeof geo === "string") {
    try {
      return JSON.parse(geo);
    } catch {
      return null;
    }
  }
  return geo;
}


function centroidFeatureFromGeojson(geo) {
  try {
    const gj = geo?.type === "FeatureCollection" ? geo : { type: "FeatureCollection", features: [geo] };
    const bounds = L.geoJSON(gj).getBounds();
    if (!bounds?.isValid?.()) return null;
    const c = bounds.getCenter();
    return {
      type: "Feature",
      properties: { _centroid: true },
      geometry: { type: "Point", coordinates: [c.lng, c.lat] },
    };
  } catch {
    return null;
  }
}

/* ----------------- Componente principal ----------------- */
export default function NuevaGeocerca({ supabaseClient = supabase }) {
  const { currentOrg } = useAuth();
  const { t } = useTranslation();

  const mapRef = useRef(null);
  const featureGroupRef = useRef(null);

  const [dataset, setDataset] = useState(null);
  const [loadingDataset, setLoadingDataset] = useState(!!DATA_SOURCE);
  const [datasetError, setDatasetError] = useState(null);

  const [geofenceList, setGeofenceList] = useState([]);
  const [selectedNames, setSelectedNames] = useState(new Set());
  const [lastSelectedName, setLastSelectedName] = useState(null);

  const [cursorLatLng, setCursorLatLng] = useState(null);

  const [geofenceName, setGeofenceName] = useState("");
  const [coordModalOpen, setCoordModalOpen] = useState(false);
  const [coordText, setCoordText] = useState("");

  // ✅ Dibujo por coordenadas en estado
  const [draftFeature, setDraftFeature] = useState(null);
  const [draftId, setDraftId] = useState(0);

  // ✅ Visualización de geocercas guardadas
  const [viewFeature, setViewFeature] = useState(null);
  const [viewCentroid, setViewCentroid] = useState(null);
  const [viewId, setViewId] = useState(0);
  const [showLoading, setShowLoading] = useState(false);

  // para guardar desde geoman
  const selectedLayerRef = useRef(null);
  const lastCreatedLayerRef = useRef(null);

  const onMapReady = useCallback((map) => {
    mapRef.current = map;
  }, []);

  const onFeatureGroupCreated = useCallback((fg) => {
    featureGroupRef.current = fg;
  }, []);

  const clearCanvas = useCallback(() => {
    featureGroupRef.current?.clearLayers?.();
    selectedLayerRef.current = null;
    lastCreatedLayerRef.current = null;
  }, []);

  /* dataset opcional */
  useEffect(() => {
    let mounted = true;
    if (!DATA_SOURCE) {
      setLoadingDataset(false);
      setDataset(null);
      setDatasetError(null);
      return;
    }
    (async () => {
      try {
        setLoadingDataset(true);
        const data = await loadShortMap({ source: DATA_SOURCE, supabaseClient });
        if (!mounted) return;
        setDataset(data);
        setDatasetError(null);
      } catch (e) {
        if (!mounted) return;
        setDataset(null);
        setDatasetError(e?.message || String(e));
      } finally {
        if (!mounted) return;
        setLoadingDataset(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [supabaseClient]);

  const refreshGeofenceList = useCallback(async () => {
    try {
      if (!currentOrg?.id) {
        setGeofenceList([]);
        return;
      }
      setGeofenceList(await listGeofences({ supabaseClient, orgId: currentOrg.id }));
    } catch {
      setGeofenceList([]);
    }
  }, [supabaseClient, currentOrg]);

  useEffect(() => {
    refreshGeofenceList();
  }, [refreshGeofenceList]);

  /* Geoman events */
  const handleGeomanCreate = useCallback((e) => {
    selectedLayerRef.current = e.layer;
    lastCreatedLayerRef.current = e.layer;
    // si dibuja con geoman, escondemos draft coords (evita confusión)
    setDraftFeature(null);
    setViewFeature(null);
  }, []);

  const handleGeomanEditUpdate = useCallback((e) => {
    if (e?.layer) {
      selectedLayerRef.current = e.layer;
      lastCreatedLayerRef.current = e.layer;
    }
  }, []);


  /* ✅ Bridge pm:* (garantiza que el layer quede referenciado) */
  const handlePmCreate = useCallback((layer) => {
    if (!layer) return;
    setDraftFeature(null);
    selectedLayerRef.current = layer;
    lastCreatedLayerRef.current = layer;

    const fg = featureGroupRef.current;
    try {
      if (fg && typeof fg.hasLayer === "function" && !fg.hasLayer(layer) && typeof fg.addLayer === "function") {
        fg.addLayer(layer);
      }
    } catch {}
  }, []);

  const handlePmUpdate = useCallback((layer) => {
    if (!layer) return;
    selectedLayerRef.current = layer;
    lastCreatedLayerRef.current = layer;
  }, []);

  const handlePmRemove = useCallback((layer) => {
    if (!layer) return;
    if (selectedLayerRef.current === layer) selectedLayerRef.current = null;
    if (lastCreatedLayerRef.current === layer) lastCreatedLayerRef.current = null;
  }, []);

  /* ✅ DIBUJAR POR COORDS (GARANTIZA VISIBLE) */
  const handleDrawFromCoords = useCallback(() => {
    const pairs = parsePairs(coordText);
    if (!pairs.length) {
      alert(t("geocercas.errorCoordsInvalid"));
      return;
    }

    const feature = featureFromCoords(pairs);

    // Estado + key para forzar re-render
    setDraftFeature(feature);
    setDraftId((x) => x + 1);
    setViewFeature(null);

    // No dependemos del canvas, pero limpiamos para que no estorbe
    clearCanvas();

    // zoom seguro
    if (mapRef.current) {
      try {
        const bounds = L.geoJSON(feature).getBounds();
        if (bounds?.isValid?.()) mapRef.current.fitBounds(bounds, { padding: [40, 40] });
      } catch {}
    }

    setCoordModalOpen(false);
    setCoordText("");
  }, [coordText, clearCanvas, t]);

  /* Guardar: si hay draft -> guarda draft; si no, guarda layer geoman */
  const saveGeofenceCollection = useCallback(
    async ({ name }) => {
      const nm = String(name || "").trim();
      if (!nm) throw new Error(t("geocercas.errorNameRequired"));

      // 1) coords draft
      if (draftFeature) {
        const geo = { type: "FeatureCollection", features: [draftFeature] };

        if (typeof window !== "undefined") {
          localStorage.setItem(
            `geocerca_${nm}`,
            JSON.stringify({ nombre: nm, geojson: geo, updated_at: new Date().toISOString() })
          );
        }

        if (supabaseClient && currentOrg?.id) {
          const { error } = await supabaseClient.from(SUPABASE_GEOFENCES_TABLE).upsert(
            { nombre: nm, org_id: currentOrg.id, geojson: geo },
            { onConflict: "org_id,nombre_ci" }
          );
          if (error) throw error;
        }
        return true;
      }

      // 2) geoman layer
      const fg = featureGroupRef.current;
      if (!fg) throw new Error(t("geocercas.errorNoShape", { defaultValue: "No hay una figura para guardar. Dibuja una geocerca primero." }));

      let layerToSave = selectedLayerRef.current || lastCreatedLayerRef.current;
      if (!layerToSave) {
        const layers = [];
        fg.eachLayer((lyr) => layers.push(lyr));
        layerToSave = layers[layers.length - 1] || null;
      }
      if (!layerToSave || typeof layerToSave.toGeoJSON !== "function") throw new Error(t("geocercas.errorNoShape", { defaultValue: "No hay una figura para guardar. Dibuja una geocerca primero." }));

      const geo = { type: "FeatureCollection", features: [layerToSave.toGeoJSON()] };

      if (typeof window !== "undefined") {
        localStorage.setItem(
          `geocerca_${nm}`,
          JSON.stringify({ nombre: nm, geojson: geo, updated_at: new Date().toISOString() })
        );
      }

      if (supabaseClient && currentOrg?.id) {
        const { error } = await supabaseClient.from(SUPABASE_GEOFENCES_TABLE).upsert(
          { nombre: nm, org_id: currentOrg.id, geojson: geo },
          { onConflict: "org_id,nombre_ci" }
        );
        if (error) throw error;
      }

      return true;
    },
    [draftFeature, supabaseClient, currentOrg, t]
  );

  const handleSave = useCallback(async () => {
    try {
      const nm = geofenceName.trim();
      if (!nm) {
        alert(t("geocercas.errorNameRequired"));
        return;
      }
      await saveGeofenceCollection({ name: nm });
      await refreshGeofenceList();
      alert(t("geocercas.savedOk"));
      setGeofenceName("");
      setDraftFeature(null);
    setViewFeature(null);
    } catch (e) {
      alert(e?.message || String(e));
    }
  }, [geofenceName, saveGeofenceCollection, refreshGeofenceList, t]);

  const handleSelectGeofence = useCallback(
    (nombre) => {
      const s = new Set(selectedNames);
      s.has(nombre) ? s.delete(nombre) : s.add(nombre);
      setSelectedNames(s);
      setLastSelectedName(nombre);
    },
    [selectedNames]
  );

  const handleDeleteSelected = useCallback(async () => {
    if (!selectedNames.size) {
      alert(t("geocercas.errorSelectAtLeastOne"));
      return;
    }
    if (!window.confirm(t("geocercas.deleteConfirm"))) return;

    const items = geofenceList.filter((g) => selectedNames.has(g.nombre));
    const count = await deleteGeofences({ items, supabaseClient });
    alert(t("geocercas.deletedCount", { count }));
    setSelectedNames(new Set());
    await refreshGeofenceList();
    clearCanvas();
    setDraftFeature(null);
    setViewFeature(null);
  }, [selectedNames, geofenceList, supabaseClient, refreshGeofenceList, clearCanvas, t]);

  const handleShowSelected = useCallback(async () => {
    setShowLoading(true);
    try {
      let nameToShow = lastSelectedName || Array.from(selectedNames)[0] || null;
      if (!nameToShow && geofenceList.length > 0) nameToShow = geofenceList[0].nombre;

      if (!nameToShow) {
        alert(t("geocercas.errorSelectAtLeastOne", { defaultValue: "Selecciona al menos una geocerca." }));
        return;
      }

      const item = geofenceList.find((g) => g.nombre === nameToShow) || null;
      if (!item) return;

      let geo = null;
      let supaError = null;

      if (item.source === "supabase") {
        if (!supabaseClient || !currentOrg?.id) {
          supaError = new Error("Org no disponible.");
        } else {
          const q = supabaseClient.from(SUPABASE_GEOFENCES_TABLE).select("geojson");
          if (item.id) q.eq("id", item.id);
          else q.eq("org_id", currentOrg.id).eq("nombre", item.nombre);

          const { data, error } = await q.maybeSingle();
          if (error) supaError = error;
          geo = normalizeGeojson(data?.geojson);
        }
      }

      if (!geo && typeof window !== "undefined") {
        const key = item.key || `geocerca_${item.nombre}`;
        const raw = localStorage.getItem(key);
        if (raw) {
          try {
            const obj = JSON.parse(raw);
            geo = normalizeGeojson(obj?.geojson);
          } catch {}
        }
      }

      if (!geo) {
        if (supaError) {
          console.warn("No se pudo leer geojson desde Supabase (posible RLS):", supaError);
          alert(
            t("geocercas.errorNoGeojson", {
              defaultValue: "No se pudo cargar el GeoJSON de la geocerca.",
            }) +
              "\n\nDetalle: " +
              (supaError.message || String(supaError))
          );
          return;
        }
        alert(t("geocercas.errorNoGeojson", { defaultValue: "No se encontró el GeoJSON de la geocerca." }));
        return;
      }

      setViewFeature(geo);
      setViewCentroid(centroidFeatureFromGeojson(geo));
      setViewId((x) => x + 1);

      if (mapRef.current) {
        try {
          mapRef.current.invalidateSize?.();
          const bounds = L.geoJSON(geo).getBounds();
          if (bounds?.isValid?.()) mapRef.current.fitBounds(bounds, { padding: [40, 40] });
          else alert("GeoJSON cargado, pero no se pudo calcular bounds.");
        } catch {}
      }
    } catch (e) {
      alert(e?.message || String(e));
    } finally {
      setShowLoading(false);
    }
  }, [selectedNames, lastSelectedName, geofenceList, supabaseClient, currentOrg, t]);



  const pointStyle = useMemo(
    () => ({
      pointToLayer: (_feature, latlng) =>
        L.circleMarker(latlng, { radius: 4, weight: 1, opacity: 1, fillOpacity: 0.8 }),
    }),
    []
  );

  // DEBUG: conteo de puntos del draft
  const draftPointsCount = useMemo(() => {
    try {
      const coords = draftFeature?.geometry?.coordinates?.[0];
      return Array.isArray(coords) ? coords.length : 0;
    } catch {
      return 0;
    }
  }, [draftFeature]);

  // primer punto para marker rojo
  const draftFirstLatLng = useMemo(() => {
    try {
      const c = draftFeature?.geometry?.coordinates?.[0]?.[0]; // [lng,lat]
      if (!c || c.length < 2) return null;
      return [c[1], c[0]]; // leaflet [lat,lng]
    } catch {
      return null;
    }
  }, [draftFeature]);

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-140px)]">
      {/* TOP BAR */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-100">{t("geocercas.titleNew")}</h1>
          <p className="text-xs text-slate-300">{t("geocercas.subtitleNew")}</p>
        </div>

        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2">
          <input
            type="text"
            className="px-4 py-2.5 rounded-lg bg-slate-900 border border-emerald-400/60 text-white font-semibold"
            placeholder={t("geocercas.placeholderName")}
            value={geofenceName}
            onChange={(e) => setGeofenceName(e.target.value)}
          />

          <button
            onClick={() => {
              setCoordText("");
              setCoordModalOpen(true);
            }}
            className="px-4 py-2.5 rounded-lg font-semibold bg-slate-800 text-slate-50 border border-slate-600"
          >
            {t("geocercas.buttonDrawByCoords")}
          </button>

          <button
            onClick={handleSave}
            className="px-4 py-2.5 rounded-lg font-semibold bg-emerald-600 text-white"
          >
            {t("geocercas.buttonSave")}
          </button>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* PANEL IZQUIERDO */}
        <div className="bg-slate-900/80 rounded-xl border border-slate-700/80 p-3 flex flex-col">
          <h2 className="text-sm font-semibold text-slate-100 mb-2">{t("geocercas.panelTitle")}</h2>

          <div className="flex-1 overflow-auto space-y-1 pr-1">
            {geofenceList.length === 0 && (
              <div className="text-xs text-slate-400">{t("geocercas.noGeofences")}</div>
            )}
            {geofenceList.map((g) => (
              <label key={`${g.source}-${g.nombre}`} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-slate-800">
                <input
                  type="checkbox"
                  checked={selectedNames.has(g.nombre)}
                  onChange={() => handleSelectGeofence(g.nombre)}
                />
                <span className="text-xs text-slate-100">{g.nombre}</span>
              </label>
            ))}
          </div>

          <div className="mt-3 flex flex-col gap-2">
            <button
              onClick={handleShowSelected}
              className="w-full px-3 py-1.5 rounded-md text-xs font-semibold bg-sky-600 text-white"
            >
              {showLoading ? t("common.loading", { defaultValue: "Cargando..." }) : t("geocercas.buttonShowOnMap", { defaultValue: "Mostrar en mapa" })}
            </button>

            <button
              onClick={handleDeleteSelected}
              className="w-full px-3 py-1.5 rounded-md text-xs font-semibold bg-red-600 text-white"
            >
              {t("geocercas.buttonDeleteSelected")}
            </button>

            <button
              onClick={() => {
                clearCanvas();
                setDraftFeature(null);
    setViewFeature(null);
                setViewFeature(null);
              }}
              className="w-full px-3 py-1.5 rounded-md text-xs font-medium bg-slate-800 text-slate-200"
            >
              {t("geocercas.buttonClearCanvas")}
            </button>
          </div>

          {loadingDataset && <div className="mt-3 text-[11px] text-slate-400">{t("geocercas.loadingDataset")}</div>}
          {datasetError && <div className="mt-3 text-[11px] text-red-300">{datasetError}</div>}
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

            {dataset && <GeoJSON data={dataset} {...pointStyle} />}

            {/* Lat/Lng vivos */}
            <CursorPosLive setCursorLatLng={setCursorLatLng} />


            {/* 👁️ Geocerca seleccionada (guardada) */}
            <Pane name="viewPane" style={{ zIndex: 640 }}>
              {viewFeature && (
                <>
                <GeoJSON
                  key={`view-${viewId}`}
                  data={viewFeature}
                  style={() => ({
                    color: "#38bdf8",
                    weight: 3,
                    fillColor: "#38bdf8",
                    fillOpacity: 0.15,
                  })}
                />
                {viewCentroid && (
                  <GeoJSON
                    key={`view-marker-${viewId}`}
                    data={viewCentroid}
                    pointToLayer={(_f, latlng) => L.circleMarker(latlng, { radius: 7, weight: 2, fillOpacity: 1 })}
                  />
                )}
                </>
              )}
            </Pane>

            {/* ✅ Pane SIEMPRE arriba */}
            <Pane name="draftPane" style={{ zIndex: 650 }}>
              {draftFeature && (
                <>
                  <GeoJSON
                    key={`draft-${draftId}`}
                    data={draftFeature}
                    style={() => ({
                      color: "#22c55e",
                      weight: 3,
                      fillColor: "#22c55e",
                      fillOpacity: 0.35,
                    })}
                  />
                  {/* Marker rojo en el primer punto para “verlo sí o sí” */}
                  {draftFirstLatLng && (
                    <GeoJSON
                      key={`draft-marker-${draftId}`}
                      data={{
                        type: "Feature",
                        properties: {},
                        geometry: { type: "Point", coordinates: [draftFeature.geometry.coordinates[0][0][0], draftFeature.geometry.coordinates[0][0][1]] },
                      }}
                      pointToLayer={(_f, latlng) =>
                        L.circleMarker(latlng, { radius: 7, weight: 2, fillOpacity: 1 })
                      }
                    />
                  )}
                </>
              )}
            </Pane>

            {/* Bridge Geoman events (pm:*) */}
            <GeomanBridge onCreateLayer={handlePmCreate} onUpdateLayer={handlePmUpdate} onRemoveLayer={handlePmRemove} />

            {/* Canvas Geoman + controles */}
            <FeatureGroup ref={featureGroupRef} whenCreated={onFeatureGroupCreated}>
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
                globalOptions={{ continueDrawing: false, editable: true }}
                onCreate={handleGeomanCreate}
                onEdit={handleGeomanEditUpdate}
                onUpdate={handleGeomanEditUpdate}
              />
            </FeatureGroup>
          </MapContainer>

          {/* Lat/Lng + DEBUG */}
          <div className="absolute right-3 top-3 z-[9999] space-y-2">
            <div className="px-3 py-1.5 rounded-md bg-black/70 text-[11px] text-slate-50 font-mono pointer-events-none">
              {cursorLatLng ? (
                <>
                  <span>Lat: {cursorLatLng.lat.toFixed(6)}</span>
                  <span className="ml-2">Lng: {cursorLatLng.lng.toFixed(6)}</span>
                </>
              ) : (
                <span>{t("geocercas.cursorHint")}</span>
              )}
            </div>

            <div className="px-3 py-1.5 rounded-md bg-black/70 text-[11px] text-slate-50 font-mono pointer-events-none">
              Draft: {draftFeature ? "SI" : "NO"} | Pts: {draftPointsCount} | id: {draftId}
            </div>
          </div>
        </div>
      </div>

      {/* Modal coordenadas */}
      {coordModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[10000]">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 w-full max-w-md space-y-3 z-[10001]">
            <h2 className="text-sm font-semibold text-slate-100 mb-1">{t("geocercas.modalTitle", { defaultValue: "Dibujar por coordenadas" })}</h2>

            <p className="text-xs text-slate-400">
              1 punto = cuadrado pequeño | 2 puntos = rectángulo | 3+ = polígono
              <br />
              Formato: <span className="font-mono text-[11px]">lat,lng</span> (uno por línea)
            </p>

            <textarea
              rows={6}
              className="w-full rounded-md bg-slate-950 border border-slate-700 text-xs text-slate-100 px-2 py-1.5"
              value={coordText}
              onChange={(e) => setCoordText(e.target.value)}
              placeholder={`-0.180653, -78.467838\n-0.181200, -78.466500\n-0.182000, -78.468200`}
            />

            <div className="flex justify-end gap-2 mt-2">
              <button
                onClick={() => setCoordModalOpen(false)}
                className="px-3 py-1.5 rounded-md text-xs font-medium bg-slate-800 text-slate-200"
              >
                {t("geocercas.modalCancel", { defaultValue: "Cancelar" })}
              </button>
              <button
                onClick={handleDrawFromCoords}
                className="px-3 py-1.5 rounded-md text-xs font-semibold bg-emerald-600 text-white"
              >
                {t("geocercas.modalDraw", { defaultValue: "Dibujar" })}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}