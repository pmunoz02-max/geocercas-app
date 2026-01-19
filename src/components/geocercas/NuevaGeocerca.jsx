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

/**
 * Este archivo vive en: src/components/geocercas/NuevaGeocerca.jsx
 * Para llegar a src/supabaseClient y src/context hay que subir 2 niveles
 */
import { supabase } from "../../supabaseClient";
import { useAuth } from "../../context/AuthContext.jsx";
import { useTranslation } from "react-i18next";

/**
 * DATASET opcional (no lo quito)
 * - null: no carga dataset
 * - 'geojson' | 'csv' | 'supabase'
 */
const DATA_SOURCE = null; // 'geojson' | 'csv' | 'supabase' | null
const GEOJSON_URL = "/data/mapa_corto_214.geojson";
const CSV_URL = "/data/mapa_corto_214.csv";

const SUPABASE_POINTS_TABLE = "puntos_mapa_corto";
const SUPABASE_GEOFENCES_TABLE = "geocercas";

/* =========================================================
   GEOMAN: fuente real de shapes (robusto)
========================================================= */
function getGeomanLayers(map) {
  try {
    if (!map?.pm?.getGeomanLayers) return [];
    return map.pm.getGeomanLayers() || [];
  } catch {
    return [];
  }
}

function getLastGeomanLayer(map) {
  const layers = getGeomanLayers(map);
  return layers.length ? layers[layers.length - 1] : null;
}

function removeAllGeomanLayers(map) {
  const layers = getGeomanLayers(map);
  for (const lyr of layers) {
    try {
      map.removeLayer(lyr);
    } catch {}
  }
}

/* =========================================================
   Utils dataset externos
========================================================= */
function parseCSV(text) {
  const lines = String(text || "").split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const latKey = headers.find((h) => ["lat", "latitude", "y"].includes(h)) || "lat";
  const lonKey =
    headers.find((h) => ["lon", "lng", "long", "longitude", "x"].includes(h)) || "lon";

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

/* =========================================================
   Utils geocercas (lista/borrar)
========================================================= */
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

async function deleteGeofences({ items, supabaseClient = null, orgId = null }) {
  let deleted = 0;

  const nombres = Array.from(new Set((items || []).map((x) => String(x?.nombre || "").trim()).filter(Boolean)));

  if (supabaseClient && nombres.length) {
    let q = supabaseClient.from(SUPABASE_GEOFENCES_TABLE).delete({ count: "exact" }).in("nombre", nombres);
    if (orgId) q = q.eq("org_id", orgId);
    const { error, count } = await q;
    if (error) throw error;
    deleted += count || 0;
  }

  if (typeof window !== "undefined" && nombres.length) {
    for (const nombre of nombres) {
      const key = `geocerca_${nombre}`;
      if (localStorage.getItem(key) !== null) {
        localStorage.removeItem(key);
        deleted += 1;
      }
    }
  }

  return deleted;
}

/* =========================================================
   Lat/Lng vivos (desktop + móvil)
========================================================= */
function CursorPosLive({ setCursorLatLng }) {
  useMapEvents({
    mousemove(e) {
      if (e?.latlng) setCursorLatLng({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
    pointermove(e) {
      if (e?.latlng) setCursorLatLng({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
    touchstart(e) {
      if (e?.latlng) setCursorLatLng({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
    touchmove(e) {
      if (e?.latlng) setCursorLatLng({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

/* =========================================================
   Coordenadas → Feature
========================================================= */
function parsePairs(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const pairs = [];

  for (const line of lines) {
    const parts = line.split(/[,\s]+/).filter(Boolean);
    if (parts.length < 2) continue;
    const lat = parseFloat(String(parts[0]).replace(",", "."));
    const lng = parseFloat(String(parts[1]).replace(",", "."));
    if (!Number.isNaN(lat) && !Number.isNaN(lng)) pairs.push([lng, lat]);
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

function featureFromCoords(pairs) {
  // 1 punto => cuadrado
  if (pairs.length === 1) {
    return {
      type: "Feature",
      properties: {},
      geometry: { type: "Polygon", coordinates: [squareFromPoint(pairs[0])] },
    };
  }
  // 2 puntos => rect
  if (pairs.length === 2) {
    return {
      type: "Feature",
      properties: {},
      geometry: { type: "Polygon", coordinates: [rectFromTwoPoints(pairs[0], pairs[1])] },
    };
  }
  // 3+ => polígono
  const ring = [...pairs];
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) ring.push(first);

  return {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [ring] },
  };
}

/* =========================================================
   Centroide (marker)
========================================================= */
function centroidOfFeatureCollection(fc) {
  try {
    const bounds = L.geoJSON(fc).getBounds();
    if (!bounds?.isValid?.()) return null;
    const c = bounds.getCenter();
    return {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: { type: "Point", coordinates: [c.lng, c.lat] },
        },
      ],
    };
  } catch {
    return null;
  }
}

/* =========================================================
   Componente principal
========================================================= */
export default function NuevaGeocerca() {
  const { t } = useTranslation();
  const { currentOrg } = useAuth();

  const supabaseClient = supabase;

  const mapRef = useRef(null);
  const featureGroupRef = useRef(null);

  const selectedLayerRef = useRef(null);
  const lastCreatedLayerRef = useRef(null);

  const [geofenceName, setGeofenceName] = useState("");
  const [geofenceList, setGeofenceList] = useState([]);
  const [selectedNames, setSelectedNames] = useState(new Set());
  const [lastSelectedName, setLastSelectedName] = useState(null);

  const [showLoading, setShowLoading] = useState(false);

  const [dataset, setDataset] = useState(null);
  const [loadingDataset, setLoadingDataset] = useState(false);
  const [datasetError, setDatasetError] = useState(null);

  const [draftFeature, setDraftFeature] = useState(null);
  const [draftId, setDraftId] = useState(1);

  const [viewFeature, setViewFeature] = useState(null);
  const [viewCentroid, setViewCentroid] = useState(null);
  const [viewId, setViewId] = useState(1);

  const [cursorLatLng, setCursorLatLng] = useState(null);

  const [coordModalOpen, setCoordModalOpen] = useState(false);
  const [coordText, setCoordText] = useState("");

  const draftPointsCount = useMemo(() => {
    try {
      const coords = draftFeature?.geometry?.coordinates?.[0];
      return Array.isArray(coords) ? Math.max(0, coords.length - 1) : 0;
    } catch {
      return 0;
    }
  }, [draftFeature]);

  const clearCanvas = useCallback(() => {
    try {
      featureGroupRef.current?.clearLayers?.();
    } catch {}
    try {
      removeAllGeomanLayers(mapRef.current);
    } catch {}

    selectedLayerRef.current = null;
    lastCreatedLayerRef.current = null;
  }, []);

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
  }, [supabaseClient, currentOrg?.id]);

  useEffect(() => {
    refreshGeofenceList();
  }, [refreshGeofenceList]);

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

  // ✅ Optimistic add: evita que tengas que refrescar para ver la nueva geocerca en panel
  const optimisticAddToList = useCallback((nm) => {
    setGeofenceList((prev) => {
      const name = String(nm || "").trim();
      if (!name) return prev;
      if (prev.some((x) => x?.nombre === name)) return prev;
      const next = [...prev, { nombre: name, source: "local", key: `geocerca_${name}` }];
      next.sort((a, b) => a.nombre.localeCompare(b.nombre));
      return next;
    });
  }, []);

  // ✅ Guardar por API serverless (cookie tg_at) + auto-mostrar en mapa sin refresh
  const saveGeofenceCollection = useCallback(
    async ({ name }) => {
      const nm = String(name || "").trim();
      if (!nm) {
        alert(t("geocercas.errorNameRequired", { defaultValue: "Escribe un nombre para la geocerca." }));
        return null;
      }
      if (!currentOrg?.id) {
        alert("Org no disponible.");
        return null;
      }

      // Tomar feature: prioridad draft, si no, última capa de geoman
      let feature = draftFeature;
      if (!feature) {
        const last = getLastGeomanLayer(mapRef.current);
        if (last?.toGeoJSON) feature = last.toGeoJSON();
      }
      if (!feature) {
        alert(t("geocercas.errorNoGeometry", { defaultValue: "Dibuja una geocerca primero." }));
        return null;
      }

      const geo = { type: "FeatureCollection", features: [feature] };

      // Persist local inmediato (para list y fallback)
      if (typeof window !== "undefined") {
        localStorage.setItem(
          `geocerca_${nm}`,
          JSON.stringify({ nombre: nm, geojson: geo, updated_at: new Date().toISOString() })
        );
      }

      // ✅ Guardar en DB vía /api/geocercas (no Supabase directo)
      const r = await fetch("/api/geocercas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "upsert",
          org_id: currentOrg.id,
          nombre: nm,
          nombre_ci: nm, // para on_conflict=org_id,nombre_ci
          geojson: geo,
          geometry: geo, // tu tabla tiene geometry NOT NULL; esto lo deja contento
        }),
      });

      const text = await r.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = { raw: text };
      }

      if (!r.ok) {
        const msg = data?.error || data?.message || data?.details?.message || `HTTP ${r.status}`;
        alert(msg);
        return null;
      }

      return { nombre: nm, geo };
    },
    [currentOrg?.id, draftFeature, t]
  );

  const handleDrawFromCoords = useCallback(() => {
    const pairs = parsePairs(coordText);
    if (!pairs.length) {
      alert(
        t("geocercas.errorCoordsInvalid", {
          defaultValue: "Coordenadas inválidas. Usa formato: lat,lng (una por línea).",
        })
      );
      return;
    }

    const feature = featureFromCoords(pairs);

    setDraftFeature(feature);
    setDraftId((x) => x + 1);
    setViewFeature(null);
    setViewCentroid(null);

    clearCanvas();

    if (mapRef.current) {
      try {
        const bounds = L.geoJSON(feature).getBounds();
        if (bounds?.isValid?.()) mapRef.current.fitBounds(bounds, { padding: [40, 40] });
      } catch {}
    }

    setCoordModalOpen(false);
    setCoordText("");
  }, [coordText, clearCanvas, t]);

  const handleSave = useCallback(async () => {
    try {
      const result = await saveGeofenceCollection({ name: geofenceName });
      if (!result) return;

      const nm = result.nombre;
      const geo = result.geo;

      // ✅ 1) Optimistic list
      optimisticAddToList(nm);

      // ✅ 2) Seleccionar y mostrar en mapa inmediatamente
      setSelectedNames(new Set([nm]));
      setLastSelectedName(nm);

      setViewFeature(geo);
      setViewCentroid(centroidOfFeatureCollection(geo));
      setViewId((x) => x + 1);

      if (mapRef.current) {
        try {
          const bounds = L.geoJSON(geo).getBounds();
          if (bounds?.isValid?.()) mapRef.current.fitBounds(bounds, { padding: [40, 40] });
        } catch {}
      }

      // ✅ 3) Refrescar lista desde DB si está disponible (no depende para UX)
      refreshGeofenceList();

      alert(t("geocercas.savedOk", { defaultValue: "Geocerca guardada." }));
    } catch (e) {
      alert(e?.message || String(e));
    }
  }, [geofenceName, saveGeofenceCollection, optimisticAddToList, refreshGeofenceList, t]);

  const handleShowSelected = useCallback(async () => {
    try {
      if (!selectedNames.size) {
        alert(t("geocercas.errorSelectOne", { defaultValue: "Selecciona al menos una geocerca." }));
        return;
      }
      setShowLoading(true);

      const nameToShow = lastSelectedName && selectedNames.has(lastSelectedName)
        ? lastSelectedName
        : Array.from(selectedNames)[0];

      // 1) Intentar localStorage primero (rápido)
      let geo = null;
      if (typeof window !== "undefined") {
        const obj = JSON.parse(localStorage.getItem(`geocerca_${nameToShow}`) || "null");
        geo = obj?.geojson || null;
      }

      // 2) Si no está en local, intenta Supabase directo (si está disponible)
      if (!geo && currentOrg?.id && supabaseClient) {
        const { data, error } = await supabaseClient
          .from(SUPABASE_GEOFENCES_TABLE)
          .select("geojson, geometry")
          .eq("org_id", currentOrg.id)
          .eq("nombre", nameToShow)
          .limit(1);

        if (!error && data?.[0]) geo = data[0].geojson || data[0].geometry || null;
      }

      if (!geo) {
        alert(t("geocercas.notFound", { defaultValue: "No se encontró la geocerca." }));
        return;
      }

      setViewFeature(geo);
      setViewCentroid(centroidOfFeatureCollection(geo));
      setViewId((x) => x + 1);

      if (mapRef.current) {
        try {
          const bounds = L.geoJSON(geo).getBounds();
          if (bounds?.isValid?.()) mapRef.current.fitBounds(bounds, { padding: [40, 40] });
        } catch {}
      }
    } finally {
      setShowLoading(false);
    }
  }, [selectedNames, lastSelectedName, currentOrg?.id, supabaseClient, t]);

  const handleDeleteSelected = useCallback(async () => {
    try {
      if (!selectedNames.size) {
        alert(t("geocercas.errorSelectOne", { defaultValue: "Selecciona al menos una geocerca." }));
        return;
      }
      const nombres = Array.from(selectedNames).map((n) => ({ nombre: n }));
      const count = await deleteGeofences({ items: nombres, supabaseClient, orgId: currentOrg?.id || null });
      setSelectedNames(new Set());
      setLastSelectedName(null);
      refreshGeofenceList();
      alert(t("geocercas.deletedOk", { defaultValue: "Eliminadas." }) + ` (${count})`);
    } catch (e) {
      alert(e?.message || String(e));
    }
  }, [selectedNames, supabaseClient, currentOrg?.id, refreshGeofenceList, t]);

  const pointStyle = useMemo(
    () => ({
      radius: 3,
      weight: 1,
      fillOpacity: 0.7,
    }),
    []
  );

  return (
    <div className="w-full h-full flex flex-col gap-3 min-h-0">
      {/* Header */}
      <div className="bg-slate-900/80 rounded-xl border border-slate-700/80 p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div>
          <h1 className="text-base md:text-lg font-bold text-slate-50">
            {t("geocercas.titleNew")}
          </h1>
          <p className="hidden md:block text-xs text-slate-300">
            {t("geocercas.subtitleNew")}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 md:flex md:items-center md:gap-2">
          <input
            type="text"
            className="col-span-2 rounded-lg bg-slate-900 border border-emerald-400/60 text-white font-semibold px-3 py-2 text-xs md:col-span-1 md:px-4 md:py-2.5 md:text-sm"
            placeholder={t("geocercas.placeholderName")}
            value={geofenceName}
            onChange={(e) => setGeofenceName(e.target.value)}
          />

          <button
            onClick={() => {
              setCoordText("");
              setCoordModalOpen(true);
            }}
            className="rounded-lg font-semibold bg-slate-800 text-slate-50 border border-slate-600 px-3 py-2 text-xs md:px-4 md:py-2.5 md:text-sm whitespace-nowrap"
          >
            {t("geocercas.buttonDrawByCoords")}
          </button>

          <button
            onClick={handleSave}
            className="rounded-lg font-semibold bg-emerald-600 text-white px-3 py-2 text-xs md:px-4 md:py-2.5 md:text-sm whitespace-nowrap"
          >
            {t("geocercas.buttonSave")}
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col gap-3 lg:grid lg:grid-cols-4">
        {/* Panel */}
        <div className="bg-slate-900/80 rounded-xl border border-slate-700/80 p-3 flex flex-col min-h-0 max-h-[42svh] md:max-h-[32svh] lg:max-h-none">
          <h2 className="text-sm font-semibold text-slate-100 mb-2">{t("geocercas.panelTitle")}</h2>

          <div className="flex-1 min-h-0 overflow-auto space-y-1 pr-1">
            {geofenceList.length === 0 && (
              <div className="text-xs text-slate-400">{t("geocercas.noGeofences")}</div>
            )}
            {geofenceList.map((g) => (
              <label
                key={`${g.source}-${g.nombre}`}
                className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-slate-800 md:px-2 md:py-1.5"
              >
                <input
                  type="checkbox"
                  checked={selectedNames.has(g.nombre)}
                  onChange={() => {
                    setSelectedNames((prev) => {
                      const next = new Set(prev);
                      if (next.has(g.nombre)) next.delete(g.nombre);
                      else next.add(g.nombre);
                      return next;
                    });
                    setLastSelectedName(g.nombre);
                  }}
                />
                <span className="text-[11px] md:text-xs text-slate-100">{g.nombre}</span>
              </label>
            ))}
          </div>

          {/* Acciones: compactas en móvil (3 columnas), desktop intacto (columna) */}
          <div className="mt-2 grid grid-cols-3 gap-2 md:mt-3 md:flex md:flex-col md:gap-2">
            <button
              onClick={handleShowSelected}
              className="w-full px-2 py-1.5 rounded-md text-[11px] font-semibold bg-sky-600 text-white md:px-3 md:py-1.5 md:text-xs"
            >
              {showLoading
                ? t("common.actions.loading", { defaultValue: "Cargando." })
                : t("geocercas.buttonShowOnMap", { defaultValue: "Mostrar en mapa" })}
            </button>

            <button
              onClick={handleDeleteSelected}
              className="w-full px-2 py-1.5 rounded-md text-[11px] font-semibold bg-red-600 text-white md:px-3 md:py-1.5 md:text-xs"
            >
              {t("geocercas.buttonDeleteSelected")}
            </button>

            <button
              onClick={() => {
                clearCanvas();
                setDraftFeature(null);
                setViewFeature(null);
                setViewCentroid(null);
              }}
              className="w-full px-2 py-1.5 rounded-md text-[11px] font-medium bg-slate-800 text-slate-200 md:px-3 md:py-1.5 md:text-xs"
            >
              {t("geocercas.buttonClearCanvas")}
            </button>
          </div>

          {loadingDataset && (
            <div className="mt-2 md:mt-3 text-[11px] text-slate-400">
              {t("geocercas.loadingDataset", { defaultValue: "Cargando dataset." })}
            </div>
          )}
          {datasetError && <div className="mt-2 md:mt-3 text-[11px] text-red-300">{datasetError}</div>}
        </div>

        {/* Mapa */}
        <div className="lg:col-span-3 bg-slate-900/80 rounded-xl overflow-hidden border border-slate-700/80 relative flex-1 min-h-[50svh] md:min-h-[62svh] lg:min-h-0">
          <MapContainer
            center={[-0.2, -78.5]}
            zoom={8}
            scrollWheelZoom={true}
            style={{ height: "100%", width: "100%" }}
            whenCreated={(map) => (mapRef.current = map)}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {dataset && <GeoJSON data={dataset} pointToLayer={(_f, latlng) => L.circleMarker(latlng, pointStyle)} />}

            <CursorPosLive setCursorLatLng={setCursorLatLng} />

            <Pane name="draftPane" style={{ zIndex: 650 }}>
              {draftFeature && (
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
              )}
            </Pane>

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

            <FeatureGroup ref={featureGroupRef}>
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
                onCreate={(e) => {
                  selectedLayerRef.current = e.layer;
                  lastCreatedLayerRef.current = e.layer;
                  setDraftFeature(null);
                  setViewFeature(null);
                  setViewCentroid(null);
                }}
                onEdit={(e) => {
                  if (e?.layer) {
                    selectedLayerRef.current = e.layer;
                    lastCreatedLayerRef.current = e.layer;
                  }
                }}
                onUpdate={(e) => {
                  if (e?.layer) {
                    selectedLayerRef.current = e.layer;
                    lastCreatedLayerRef.current = e.layer;
                  }
                }}
              />
            </FeatureGroup>
          </MapContainer>

          {/* ✅ MÓVIL: SOLO barrita mini */}
          {cursorLatLng && (
            <div className="md:hidden absolute right-2 top-2 z-[9999] px-2 py-1 rounded bg-black/80 text-[11px] text-white font-mono pointer-events-none">
              {cursorLatLng.lat.toFixed(5)}, {cursorLatLng.lng.toFixed(5)}
            </div>
          )}

          {/* ✅ DESKTOP: HUD original intacto */}
          <div className="hidden md:block absolute right-3 top-3 z-[9999] space-y-2">
            <div className="px-3 py-1.5 rounded-md bg-black/70 text-[11px] text-slate-50 font-mono pointer-events-none">
              {cursorLatLng ? (
                <>
                  <span>
                    {t("geocercas.lat", { defaultValue: "Lat" })}: {cursorLatLng.lat.toFixed(6)}
                  </span>
                  <span className="ml-2">
                    {t("geocercas.lng", { defaultValue: "Lng" })}: {cursorLatLng.lng.toFixed(6)}
                  </span>
                </>
              ) : (
                <span>{t("geocercas.cursorHint")}</span>
              )}
            </div>

            <div className="px-3 py-1.5 rounded-md bg-black/70 text-[11px] text-slate-50 font-mono pointer-events-none">
              {t("geocercas.draftLabel", { defaultValue: "Draft" })}:{" "}
              {draftFeature ? t("common.actions.yes", { defaultValue: "Sí" }) : t("common.actions.no", { defaultValue: "No" })}{" "}
              | {t("geocercas.pointsLabel", { defaultValue: "Pts" })}: {draftPointsCount}
            </div>
          </div>
        </div>
      </div>

      {coordModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[10000]">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 w-full max-w-md space-y-3 z-[10001]">
            <h2 className="text-sm font-semibold text-slate-100 mb-1">
              {t("geocercas.modalTitle", { defaultValue: "Dibujar por coordenadas" })}
            </h2>

            <p className="text-xs text-slate-400">
              {t("geocercas.modalHintRule", {
                defaultValue: "1 punto = cuadrado pequeño | 2 puntos = rectángulo | 3+ = polígono",
              })}
              <br />
              {t("geocercas.modalInstruction", { defaultValue: "Formato:" })}{" "}
              <span className="font-mono text-[11px]">lat,lng</span>{" "}
              {t("geocercas.modalOnePerLine", { defaultValue: "(uno por línea)" })}
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
                {t("common.actions.cancel", { defaultValue: "Cancelar" })}
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
