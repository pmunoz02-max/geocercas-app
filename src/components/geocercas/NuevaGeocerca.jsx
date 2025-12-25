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
 * IMPORTS IMPORTANTES:
 * Este archivo vive en: src/components/geocercas/NuevaGeocerca.jsx
 * Por eso, para llegar a src/supabaseClient y src/context hay que subir 2 niveles (../../)
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
    const { data, error } = await supabaseClient
      .from(SUPABASE_POINTS_TABLE)
      .select("*")
      .limit(10000);
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

    if (!error && data)
      data.forEach((r) => list.push({ id: r.id, nombre: r.nombre, source: "supabase" }));
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

  const nombres = Array.from(
    new Set((items || []).map((x) => String(x?.nombre || "").trim()).filter(Boolean))
  );

  if (supabaseClient && nombres.length) {
    let q = supabaseClient
      .from(SUPABASE_GEOFENCES_TABLE)
      .delete({ count: "exact" })
      .in("nombre", nombres);

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
    const parts = line.split(/[,;\s]+/).filter(Boolean);
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

/* =========================================================
   Utils GeoJSON
========================================================= */
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
    const gj =
      geo?.type === "FeatureCollection"
        ? geo
        : { type: "FeatureCollection", features: [geo] };
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

/* =========================================================
   Componente principal
========================================================= */
export default function NuevaGeocerca({ supabaseClient = supabase }) {
  const { currentOrg } = useAuth();
  const { t } = useTranslation();

  const mapRef = useRef(null);
  const featureGroupRef = useRef(null);

  const [dataset, setDataset] = useState(null);
  const [loadingDataset, setLoadingDataset] = useState(!!DATA_SOURCE);
  const [datasetError, setDatasetError] = useState(null);

  const [geofenceList, setGeofenceList] = useState([]);
  const [selectedNames, setSelectedNames] = useState(() => new Set());
  const [lastSelectedName, setLastSelectedName] = useState(null);

  const [cursorLatLng, setCursorLatLng] = useState(null);

  const [geofenceName, setGeofenceName] = useState("");
  const [coordModalOpen, setCoordModalOpen] = useState(false);
  const [coordText, setCoordText] = useState("");

  const [draftFeature, setDraftFeature] = useState(null);
  const [draftId, setDraftId] = useState(0);

  const [viewFeature, setViewFeature] = useState(null);
  const [viewCentroid, setViewCentroid] = useState(null);
  const [viewId, setViewId] = useState(0);
  const [showLoading, setShowLoading] = useState(false);

  const selectedLayerRef = useRef(null);
  const lastCreatedLayerRef = useRef(null);

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

  const saveGeofenceCollection = useCallback(
    async ({ name }) => {
      const nm = String(name || "").trim();
      if (!nm) {
        alert(
          t("geocercas.errorNameRequired", { defaultValue: "Escribe un nombre para la geocerca." })
        );
        return false;
      }
      if (!currentOrg?.id) {
        alert("Org no disponible.");
        return false;
      }

      if (draftFeature) {
        const geo = { type: "FeatureCollection", features: [draftFeature] };

        if (typeof window !== "undefined") {
          localStorage.setItem(
            `geocerca_${nm}`,
            JSON.stringify({ nombre: nm, geojson: geo, updated_at: new Date().toISOString() })
          );
        }

        const { error } = await supabaseClient.from(SUPABASE_GEOFENCES_TABLE).upsert(
          { nombre: nm, org_id: currentOrg.id, geojson: geo },
          { onConflict: "org_id,nombre_ci" }
        );
        if (error) throw error;

        return true;
      }

      const map = mapRef.current;
      const layerToSave =
        selectedLayerRef.current || lastCreatedLayerRef.current || getLastGeomanLayer(map);

      if (!layerToSave || typeof layerToSave.toGeoJSON !== "function") {
        alert(
          t("geocercas.errorNoShape", {
            defaultValue:
              "Dibuja una geocerca en el mapa o crea una por coordenadas antes de guardar.",
          })
        );
        return false;
      }

      const geo = { type: "FeatureCollection", features: [layerToSave.toGeoJSON()] };

      if (typeof window !== "undefined") {
        localStorage.setItem(
          `geocerca_${nm}`,
          JSON.stringify({ nombre: nm, geojson: geo, updated_at: new Date().toISOString() })
        );
      }

      const { error } = await supabaseClient.from(SUPABASE_GEOFENCES_TABLE).upsert(
        { nombre: nm, org_id: currentOrg.id, geojson: geo },
        { onConflict: "org_id,nombre_ci" }
      );
      if (error) throw error;

      return true;
    },
    [draftFeature, supabaseClient, currentOrg?.id, t]
  );

  const handleSave = useCallback(async () => {
    try {
      const nm = geofenceName.trim();
      if (!nm) {
        alert(
          t("geocercas.errorNameRequired", { defaultValue: "Escribe un nombre para la geocerca." })
        );
        return;
      }

      const ok = await saveGeofenceCollection({ name: nm });
      if (!ok) return;

      await refreshGeofenceList();
      alert(t("geocercas.savedOk", { defaultValue: "Geocerca guardada correctamente." }));

      setGeofenceName("");
      setDraftFeature(null);
    } catch (e) {
      alert(e?.message || String(e));
    }
  }, [geofenceName, saveGeofenceCollection, refreshGeofenceList, t]);

  const handleDeleteSelected = async () => {
    if (!selectedNames || selectedNames.size === 0) {
      alert(
        t("geocercas.errorSelectAtLeastOne", { defaultValue: "Selecciona al menos una geocerca." })
      );
      return;
    }
    if (
      !window.confirm(
        t("geocercas.deleteConfirm", { defaultValue: "¿Eliminar las geocercas seleccionadas?" })
      )
    )
      return;

    try {
      const names = Array.from(selectedNames);
      const items = geofenceList.filter((g) => names.includes(g.nombre));

      const count = await deleteGeofences({
        items,
        supabaseClient,
        orgId: currentOrg?.id,
      });

      alert(t("geocercas.deletedCount", { count, defaultValue: `Eliminadas: ${count}` }));

      setSelectedNames(() => new Set());
      setLastSelectedName(null);
      setViewFeature(null);
      setViewCentroid(null);

      await refreshGeofenceList();
      clearCanvas();
      setDraftFeature(null);
    } catch (e) {
      alert(e?.message || String(e));
    }
  };

  const handleShowSelected = useCallback(async () => {
    setShowLoading(true);
    try {
      let nameToShow = lastSelectedName || Array.from(selectedNames)[0] || null;
      if (!nameToShow && geofenceList.length > 0) nameToShow = geofenceList[0].nombre;

      if (!nameToShow) {
        alert(
          t("geocercas.errorSelectAtLeastOne", { defaultValue: "Selecciona al menos una geocerca." })
        );
        return;
      }

      const item = geofenceList.find((g) => g.nombre === nameToShow) || null;
      if (!item) return;

      let geo = null;

      if (item.source === "supabase") {
        if (!supabaseClient || !currentOrg?.id) {
          alert("Org no disponible.");
          return;
        }
        const q = supabaseClient
          .from(SUPABASE_GEOFENCES_TABLE)
          .select("geojson")
          .eq("org_id", currentOrg.id);

        if (item.id) q.eq("id", item.id);
        else q.eq("nombre", item.nombre);

        const { data, error } = await q.maybeSingle();
        if (error) throw error;
        geo = normalizeGeojson(data?.geojson);
      }

      if (!geo && typeof window !== "undefined") {
        const key = item.key || `geocerca_${item.nombre}`;
        const raw = localStorage.getItem(key);
        if (raw) {
          const obj = JSON.parse(raw);
          geo = normalizeGeojson(obj?.geojson);
        }
      }

      if (!geo) {
        alert(
          t("geocercas.errorNoGeojson", { defaultValue: "No se encontró el GeoJSON de la geocerca." })
        );
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
        } catch {}
      }
    } catch (e) {
      alert(e?.message || String(e));
    } finally {
      setShowLoading(false);
    }
  }, [selectedNames, lastSelectedName, geofenceList, supabaseClient, currentOrg?.id, t]);

  const pointStyle = useMemo(
    () => ({
      pointToLayer: (_feature, latlng) =>
        L.circleMarker(latlng, { radius: 4, weight: 1, opacity: 1, fillOpacity: 0.8 }),
    }),
    []
  );

  const draftPointsCount = useMemo(() => {
    try {
      const coords = draftFeature?.geometry?.coordinates?.[0];
      return Array.isArray(coords) ? coords.length : 0;
    } catch {
      return 0;
    }
  }, [draftFeature]);

  return (
    <div className="flex flex-col gap-2 sm:gap-3 h-[calc(100svh-140px)] lg:h-[calc(100vh-140px)]">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div className="space-y-0.5">
          <h1 className="text-xl sm:text-2xl font-semibold text-slate-100">
            {t("geocercas.titleNew")}
          </h1>

          {/* SOLO MÓVIL: oculto para ganar espacio (desktop intacto) */}
          <p className="hidden md:block text-xs text-slate-300">{t("geocercas.subtitleNew")}</p>
        </div>

        {/* =========================================================
            HEADER CONTROLS
            - MÓVIL: input (fila 1) + 2 botones (fila 2) MÁS PEQUEÑOS
            - DESKTOP: md:flex como estaba
           ========================================================= */}
        <div className="grid grid-cols-2 gap-2 md:flex md:items-center md:gap-2">
          <input
            type="text"
            className="col-span-2 rounded-lg bg-slate-900 border border-emerald-400/60 text-white font-semibold px-3 py-2 text-xs md:col-span-1 md:px-4 md:py-2.5 md:text-sm"
            placeholder={t("geocercas.placeholderName")}
            value={geofenceName}
            onChange={(e) => setGeofenceName(e.target.value)}
          />

          {/* MÓVIL: más compacto (py/px/text), sin romper desktop */}
          <button
            onClick={() => {
              setCoordText("");
              setCoordModalOpen(true);
            }}
            className="min-w-0 rounded-md font-semibold bg-slate-800 text-slate-50 border border-slate-600
                       px-2.5 py-1.5 text-[11px] leading-tight
                       md:rounded-lg md:px-4 md:py-2.5 md:text-sm whitespace-nowrap"
            title={t("geocercas.buttonDrawByCoords")}
          >
            <span className="block truncate">{t("geocercas.buttonDrawByCoords")}</span>
          </button>

          <button
            onClick={handleSave}
            className="min-w-0 rounded-md font-semibold bg-emerald-600 text-white
                       px-2.5 py-1.5 text-[11px] leading-tight
                       md:rounded-lg md:px-4 md:py-2.5 md:text-sm whitespace-nowrap"
            title={t("geocercas.buttonSave")}
          >
            <span className="block truncate">{t("geocercas.buttonSave")}</span>
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col gap-3 lg:grid lg:grid-cols-4">
        {/* Panel */}
        <div className="bg-slate-900/80 rounded-xl border border-slate-700/80 p-3 flex flex-col min-h-0 max-h-[30svh] md:max-h-[32svh] lg:max-h-none">
          <h2 className="text-sm font-semibold text-slate-100 mb-2">{t("geocercas.panelTitle")}</h2>

          <div className="flex-1 min-h-0 overflow-auto space-y-1 pr-1">
            {geofenceList.length === 0 && (
              <div className="text-xs text-slate-400">{t("geocercas.noGeofences")}</div>
            )}
            {geofenceList.map((g) => (
              <label
                key={`${g.source}-${g.nombre}`}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-slate-800"
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
                <span className="text-xs text-slate-100">{g.nombre}</span>
              </label>
            ))}
          </div>

          {/* =========================================================
              ACCIONES DEL PANEL
              - MÓVIL: 2 columnas (Mostrar / Eliminar) + Limpiar a lo ancho
              - DESKTOP: vuelve al stack vertical (md:flex-col) como estaba
             ========================================================= */}
          <div className="mt-3 grid grid-cols-2 gap-2 md:flex md:flex-col">
            <button
              onClick={handleShowSelected}
              className="w-full px-2.5 py-1.5 rounded-md text-[11px] leading-tight font-semibold bg-sky-600 text-white
                         md:px-3 md:py-1.5 md:rounded-md md:text-xs"
              title={t("geocercas.buttonShowOnMap", { defaultValue: "Mostrar en mapa" })}
            >
              <span className="block truncate">
                {showLoading
                  ? t("common.actions.loading", { defaultValue: "Cargando..." })
                  : t("geocercas.buttonShowOnMap", { defaultValue: "Mostrar en mapa" })}
              </span>
            </button>

            <button
              onClick={handleDeleteSelected}
              className="w-full px-2.5 py-1.5 rounded-md text-[11px] leading-tight font-semibold bg-red-600 text-white
                         md:px-3 md:py-1.5 md:rounded-md md:text-xs"
              title={t("geocercas.buttonDeleteSelected")}
            >
              <span className="block truncate">{t("geocercas.buttonDeleteSelected")}</span>
            </button>

            <button
              onClick={() => {
                clearCanvas();
                setDraftFeature(null);
                setViewFeature(null);
                setViewCentroid(null);
              }}
              className="col-span-2 w-full px-2.5 py-1.5 rounded-md text-[11px] leading-tight font-medium bg-slate-800 text-slate-200
                         md:col-span-1 md:px-3 md:py-1.5 md:rounded-md md:text-xs"
              title={t("geocercas.buttonClearCanvas")}
            >
              <span className="block truncate">{t("geocercas.buttonClearCanvas")}</span>
            </button>
          </div>

          {loadingDataset && (
            <div className="mt-3 text-[11px] text-slate-400">
              {t("geocercas.loadingDataset", { defaultValue: "Cargando dataset..." })}
            </div>
          )}
          {datasetError && <div className="mt-3 text-[11px] text-red-300">{datasetError}</div>}
        </div>

        {/* Mapa */}
        <div className="lg:col-span-3 bg-slate-900/80 rounded-xl overflow-hidden border border-slate-700/80 relative flex-1 min-h-[58svh] md:min-h-[62svh] lg:min-h-0">
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

            {dataset && <GeoJSON data={dataset} {...pointStyle} />}

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
                      pointToLayer={(_f, latlng) =>
                        L.circleMarker(latlng, { radius: 7, weight: 2, fillOpacity: 1 })
                      }
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

          {/* ✅ MÓVIL: SOLO barrita mini (eliminamos hint grande) */}
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
              {draftFeature
                ? t("common.actions.yes", { defaultValue: "Sí" })
                : t("common.actions.no", { defaultValue: "No" })}{" "}
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
                defaultValue:
                  "1 punto = cuadrado pequeño | 2 puntos = rectángulo | 3+ = polígono",
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
