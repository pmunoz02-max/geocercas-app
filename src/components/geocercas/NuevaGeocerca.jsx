// src/components/geocercas/NuevaGeocerca.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, FeatureGroup, Pane, useMapEvents } from "react-leaflet";
import L from "leaflet";

import "leaflet/dist/leaflet.css";

// ✅ IMPORT CORRECTO (Vercel build fix):
import { GeomanControls } from "react-leaflet-geoman-v2";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";

import { useAuth } from "../../context/AuthContext.jsx";
import { useTranslation } from "react-i18next";

import { listGeocercas, getGeocerca, upsertGeocerca, deleteGeocerca } from "../../lib/geocercasApi.js";

/**
 * DATASET opcional:
 * - null: no carga dataset
 * - 'geojson' | 'csv'
 */
const DATA_SOURCE = null; // 'geojson' | 'csv' | null
const GEOJSON_URL = "/data/mapa_corto_214.geojson";
const CSV_URL = "/data/mapa_corto_214.csv";

/**
 * ✅ FIX UNIVERSAL:
 * Solo usar LocalStorage si la API falla (modo offline real).
 * Si la API responde OK, NO mezclamos local para evitar “revivir” borradas.
 */
const USE_LOCAL_FALLBACK_ONLY_WHEN_API_FAILS = true;

/* ----------------------------- UI helpers ----------------------------- */
function Banner({ banner, onClose }) {
  if (!banner) return null;

  const klass =
    banner.type === "error"
      ? "bg-red-900/60 border-red-500/50 text-red-100"
      : banner.type === "ok"
      ? "bg-emerald-900/60 border-emerald-500/50 text-emerald-100"
      : "bg-slate-900/60 border-slate-500/50 text-slate-100";

  return (
    <div className={`rounded-xl border px-3 py-2 text-sm flex items-start justify-between gap-3 ${klass}`}>
      <div className="leading-snug">{banner.text}</div>
      <button
        className="px-2 py-1 rounded-md bg-black/20 hover:bg-black/30 text-xs font-semibold"
        onClick={onClose}
        type="button"
      >
        OK
      </button>
    </div>
  );
}

/* ----------------------------- Geoman helpers ----------------------------- */
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

/* ----------------------------- Dataset helpers ---------------------------- */
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

async function loadShortMap({ source = DATA_SOURCE } = {}) {
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

  throw new Error("DATA_SOURCE no reconocido");
}

/* ----------------------------- Local fallback ----------------------------- */
function normalizeNombreCi(nombre) {
  return String(nombre || "").trim().toLowerCase();
}

function isSoftDeletedName(nombre) {
  const nm = String(nombre || "").trim().toLowerCase();
  return nm.startsWith("deleted_") || nm.startsWith("deleted-") || nm === "deleted";
}

function filterSoftDeleted(items) {
  return (items || []).filter((g) => !isSoftDeletedName(g?.nombre || g?.name || ""));
}

/**
 * LocalStorage TENANT-SAFE:
 * geocerca_<orgId>_<nombre>
 */
function makeLocalKey(orgId, nombre) {
  const oid = String(orgId || "").trim();
  const nm = String(nombre || "").trim();
  return `geocerca_${oid}_${nm}`;
}

function readLocalGeocercas(orgId) {
  const list = [];
  if (typeof window === "undefined") return list;
  const prefix = `geocerca_${String(orgId || "").trim()}_`;
  if (!orgId) return list;

  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    if (!k.startsWith(prefix)) continue;

    try {
      const obj = JSON.parse(localStorage.getItem(k) || "{}");
      const nombre = obj?.nombre || k.slice(prefix.length);
      if (!isSoftDeletedName(nombre)) list.push({ key: k, nombre, source: "local" });
    } catch {}
  }
  return list;
}

function mergeUniqueByNombre(items) {
  const seen = new Set();
  const unique = [];
  for (const g of items || []) {
    const nm = String(g?.nombre ?? g?.name ?? "").trim();  // ✅ FIX
    if (!nm) continue;
    if (seen.has(nm)) continue;
    seen.add(nm);
    unique.push({ ...g, nombre: nm }); // ✅ normaliza a "nombre"
  }
  unique.sort((a, b) => a.nombre.localeCompare(b.nombre));
  return unique;
}

function deleteFromLocalStorageByNames(orgId, names) {
  if (typeof window === "undefined") return 0;
  if (!orgId) return 0;

  let deleted = 0;
  for (const nm of names) {
    const key = makeLocalKey(orgId, nm);
    if (localStorage.getItem(key) !== null) {
      localStorage.removeItem(key);
      deleted += 1;
    }
  }
  return deleted;
}

/**
 * ✅ Tombstones persistentes (por org) para evitar que reaparezca por local
 */
function tombstoneKey(orgId) {
  return `geocerca_tombstones_${String(orgId || "").trim()}`;
}

function readTombstones(orgId) {
  if (typeof window === "undefined") return new Set();
  if (!orgId) return new Set();
  try {
    const raw = localStorage.getItem(tombstoneKey(orgId));
    const arr = raw ? JSON.parse(raw) : [];
    return new Set((Array.isArray(arr) ? arr : []).map((x) => normalizeNombreCi(x)));
  } catch {
    return new Set();
  }
}

function addTombstones(orgId, names) {
  if (typeof window === "undefined") return;
  if (!orgId) return;
  const set = readTombstones(orgId);
  for (const nm of names || []) set.add(normalizeNombreCi(nm));
  try {
    localStorage.setItem(tombstoneKey(orgId), JSON.stringify(Array.from(set)));
  } catch {}
}

function purgeTombstonesFromList(items, orgId) {
  const tombs = readTombstones(orgId);
  return (items || []).filter((g) => !tombs.has(normalizeNombreCi(g?.nombre)));
}

/* ----------------------------- Unified list ----------------------------- */
async function listGeofencesUnified({ orgId }) {
  try {
    const apiItems = await listGeocercas({ orgId });
    const apiList = (apiItems || [])
      .map((r) => ({ id: r.id, nombre: r.nombre || r.name, source: "api" }))
      .filter((g) => !!g.nombre);

    const apiClean = mergeUniqueByNombre(filterSoftDeleted(purgeTombstonesFromList(apiList, orgId)));

    if (USE_LOCAL_FALLBACK_ONLY_WHEN_API_FAILS) return apiClean;

    const local = readLocalGeocercas(orgId);
    const merged = [...apiClean, ...local];
    return mergeUniqueByNombre(filterSoftDeleted(purgeTombstonesFromList(merged, orgId)));
  } catch (e) {
    console.warn("[NuevaGeocerca] API listGeocercas falló, usando local", e);
    const local = readLocalGeocercas(orgId);
    return mergeUniqueByNombre(filterSoftDeleted(purgeTombstonesFromList(local, orgId)));
  }
}

/* ----------------------------- Map cursor live ---------------------------- */
function CursorPosLive({ setCursorLatLng }) {
  useMapEvents({
    mousemove(e) {
      if (e?.latlng) setCursorLatLng({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
    touchmove(e) {
      if (e?.latlng) setCursorLatLng({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
    touchstart(e) {
      if (e?.latlng) setCursorLatLng({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

/* ------------------------- Coords -> polygon feature ---------------------- */
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

/* ----------------------------- GeoJSON helpers ---------------------------- */
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

/* ================================ Component =============================== */
export default function NuevaGeocerca() {
  const { currentOrg, user } = useAuth();
  const { t } = useTranslation();

  const orgId = currentOrg?.id || currentOrg?.org_id || null;

  const mapRef = useRef(null);
  const featureGroupRef = useRef(null);

  const [banner, setBanner] = useState(null);
  const showOk = useCallback((text) => setBanner({ type: "ok", text }), []);
  const showErr = useCallback((text, err) => {
    if (err) console.error("[NuevaGeocerca]", text, err);
    setBanner({ type: "error", text });
  }, []);

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

  const invalidateMapSize = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    setTimeout(() => {
      try {
        map.invalidateSize?.();
      } catch {}
    }, 50);
    setTimeout(() => {
      try {
        map.invalidateSize?.();
      } catch {}
    }, 220);
  }, []);

  const refreshGeofenceList = useCallback(async () => {
  try {
    // 1) pide al API
    const rows = await listGeocercas({ orgId });

    // 2) normaliza campos y filtra vacíos
    const normalized = (rows || [])
      .map((r) => {
        const nombre = String(r?.nombre ?? r?.name ?? "").trim();
        return {
          id: r?.id,
          nombre,
          org_id: r?.org_id ?? r?.orgId ?? null,
          source: "api",
        };
      })
      .filter((g) => !!g.nombre);

    // 3) unique por nombre (sin botar nada por errores)
    const seen = new Set();
    const unique = [];
    for (const g of normalized) {
      if (seen.has(g.nombre)) continue;
      seen.add(g.nombre);
      unique.push(g);
    }

    setGeofenceList(unique);
  } catch (e) {
    console.error("[NuevaGeocerca] refreshGeofenceList error", e);
    setGeofenceList([]);
  }
}, [orgId]);

  const handleDrawFromCoords = useCallback(() => {
    const pairs = parsePairs(coordText);
    if (!pairs.length) {
      showErr(
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
    showOk(t("geocercas.coordsReady", { defaultValue: "Figura creada desde coordenadas." }));
  }, [coordText, clearCanvas, t, showErr, showOk]);

  /**
   * ✅ Envío correcto al backend:
   * - Polígonos: Feature Polygon
   * - Círculo: Feature Point + properties.radius_m
   *
   * Nota: aquí enviamos **feature** (no FeatureCollection) para que tu función
   * _geojson_extract_geometry funcione perfecto (Feature/FC/Geometry).
   */
  const handleSave = useCallback(async () => {
    const nm = String(geofenceName || "").trim();
    if (!nm) {
      showErr(t("geocercas.errorNameRequired", { defaultValue: "Escribe un nombre para la geocerca." }));
      return;
    }
    if (!orgId) {
      showErr(t("geocercas.manage.noOrgTitle", { defaultValue: "Selecciona una organización primero." }));
      return;
    }

    let feature = null;

    if (draftFeature) {
      feature = draftFeature;
    } else {
      const map = mapRef.current;
      const layerToSave = selectedLayerRef.current || lastCreatedLayerRef.current || getLastGeomanLayer(map);

      if (!layerToSave) {
        showErr(
          t("geocercas.errorNoShape", {
            defaultValue: "Dibuja una geocerca o crea una por coordenadas antes de guardar.",
          })
        );
        return;
      }

      // Circle → Feature Point + radius_m
      if (layerToSave instanceof L.Circle) {
        const center = layerToSave.getLatLng?.();
        const radiusM = Math.round(Number(layerToSave.getRadius?.() || 0));
        if (!center || !radiusM || radiusM <= 0) {
          showErr("Círculo inválido (sin centro o radio).");
          return;
        }
        feature = {
          type: "Feature",
          properties: { radius_m: radiusM, shape: "circle" },
          geometry: { type: "Point", coordinates: [center.lng, center.lat] },
        };
      } else {
        if (typeof layerToSave.toGeoJSON !== "function") {
          showErr(
            t("geocercas.errorNoShape", {
              defaultValue: "Dibuja una geocerca o crea una por coordenadas antes de guardar.",
            })
          );
          return;
        }
        const gj = layerToSave.toGeoJSON();
        feature = gj?.type === "Feature" ? gj : { type: "Feature", properties: {}, geometry: gj };
      }
    }

    if (!feature?.geometry || !feature?.geometry?.type) {
      showErr("GeoJSON inválido (sin geometry).");
      return;
    }

    // Vista siempre como FC (solo para render)
    const fc = { type: "FeatureCollection", features: [feature] };

    // Local write (solo cache UI)
    try {
      if (typeof window !== "undefined") {
        localStorage.setItem(
          makeLocalKey(orgId, nm),
          JSON.stringify({ nombre: nm, org_id: orgId, geojson: fc, updated_at: new Date().toISOString() })
        );
      }
    } catch {}

    try {
      await upsertGeocerca({
        // 🔥 Importante: NO mandamos id (para evitar "id null")
        org_id: orgId,
        nombre: nm,
        geojson: feature, // ✅ Feature (no FC)
        geometry: feature, // compat
      });

      setSelectedNames(() => new Set([nm]));
      setLastSelectedName(nm);

      setViewFeature(fc);
      setViewCentroid(centroidFeatureFromGeojson(fc));
      setViewId((x) => x + 1);

      try {
        const map = mapRef.current;
        if (map) {
          const bounds = L.geoJSON(fc).getBounds();
          if (bounds?.isValid?.()) map.fitBounds(bounds, { padding: [40, 40] });
        }
      } catch {}

      invalidateMapSize();
      setGeofenceName("");
      setDraftFeature(null);

      await refreshGeofenceList();
      showOk(t("geocercas.saved", { defaultValue: "Geocerca guardada." }));
    } catch (e) {
      showErr(t("geocercas.saveError", { defaultValue: "No se pudo guardar. Intenta nuevamente." }), e);
      try {
        await refreshGeofenceList();
      } catch {}
    }
  }, [geofenceName, orgId, draftFeature, t, refreshGeofenceList, showErr, showOk, invalidateMapSize]);

  onst names = Array.from(selectedNames).map((x) => String(x || "").trim()).filter(Boolean);

// NUEVO: buscar ids de esos nombres en tu lista actual
const idsToDelete = (geofenceList || [])
  .filter((g) => names.includes(String(g?.nombre || "").trim()))
  .map((g) => g.id)
  .filter(Boolean);

if (!idsToDelete.length) {
  showErr("No se encontraron IDs para eliminar. Refresca la lista e intenta otra vez.");
  return;
}

    if (!selectedNames || selectedNames.size === 0) {
      showErr(t("geocercas.errorSelectAtLeastOne", { defaultValue: "Selecciona al menos una geocerca." }));
      return;
    }

    const confirmed = window.confirm(
      t("geocercas.deleteConfirm", { defaultValue: "¿Eliminar las geocercas seleccionadas?" })
    );
    if (!confirmed) return;

    const names = Array.from(selectedNames).map((x) => String(x || "").trim()).filter(Boolean);

    setGeofenceList((prev) => (prev || []).filter((g) => !names.includes(String(g?.nombre || "").trim())));
    setSelectedNames(() => new Set());
    setLastSelectedName(null);
    setViewFeature(null);
    setViewCentroid(null);

    addTombstones(orgId, names);
    deleteFromLocalStorageByNames(orgId, names);

    try {
      await deleteGeocerca({
        orgId,
        nombres_ci: names.map(normalizeNombreCi),
      });

      await refreshGeofenceList();
      clearCanvas();
      setDraftFeature(null);

      showOk(
        t("geocercas.deletedCount", {
          count: names.length,
          defaultValue: `Eliminadas: ${names.length}`,
        })
      );
    } catch (e) {
      showErr(t("geocercas.deleteError", { defaultValue: "No se pudo eliminar. Intenta nuevamente." }), e);
      try {
        await refreshGeofenceList();
      } catch {}
    }
  }, [orgId, selectedNames, refreshGeofenceList, clearCanvas, t, showErr, showOk]);

  const handleShowSelected = useCallback(async () => {
    setShowLoading(true);
    try {
      if (!orgId) {
        showErr(t("geocercas.manage.noOrgTitle", { defaultValue: "Selecciona una organización primero." }));
        return;
      }

      let nameToShow = lastSelectedName || Array.from(selectedNames)[0] || null;
      if (!nameToShow && geofenceList.length > 0) nameToShow = geofenceList[0].nombre;
      if (!nameToShow) {
        showErr(t("geocercas.errorSelectAtLeastOne", { defaultValue: "Selecciona al menos una geocerca." }));
        return;
      }

      const item = geofenceList.find((g) => g.nombre === nameToShow) || null;
      if (!item) return;

      let geo = null;

      if (item.source === "api" && orgId && item.id && !String(item.id).startsWith("optim-")) {
        const row = await getGeocerca({ id: item.id, orgId });
        geo = normalizeGeojson(row?.geojson || row?.geometry);
      }

      if (!geo && typeof window !== "undefined") {
        const key = item.key || makeLocalKey(orgId, item.nombre);
        const raw = localStorage.getItem(key);
        if (raw) {
          const obj = JSON.parse(raw);
          geo = normalizeGeojson(obj?.geojson);
        }
      }

      if (!geo) {
        showErr(t("geocercas.errorNoGeojson", { defaultValue: "No se encontró el GeoJSON." }));
        return;
      }

      const fc = geo?.type === "FeatureCollection" ? geo : { type: "FeatureCollection", features: [geo] };

      setViewFeature(fc);
      setViewCentroid(centroidFeatureFromGeojson(fc));
      setViewId((x) => x + 1);

      if (mapRef.current) {
        try {
          mapRef.current.invalidateSize?.();
          const bounds = L.geoJSON(fc).getBounds();
          if (bounds?.isValid?.()) mapRef.current.fitBounds(bounds, { padding: [40, 40] });
        } catch {}
      }
    } catch (e) {
      showErr(t("geocercas.errorLoad", { defaultValue: "No se pudo cargar la geocerca." }), e);
    } finally {
      setShowLoading(false);
    }
  }, [orgId, selectedNames, lastSelectedName, geofenceList, t, showErr]);

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

  if (!user) return null;

  return (
    <div className="flex flex-col gap-2 sm:gap-3 h-[calc(100svh-140px)] lg:h-[calc(100vh-140px)]">
      <Banner banner={banner} onClose={() => setBanner(null)} />

      <div className="text-[11px] text-slate-300">
        OrgId actual: <span className="font-mono text-slate-100">{orgId || "null"}</span>
      </div>

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div className="space-y-0.5">
          <h1 className="text-xl sm:text-2xl font-semibold text-slate-100">
            {t("geocercas.titleNew", { defaultValue: "Nueva geocerca" })}
          </h1>
          <p className="hidden md:block text-xs text-slate-300">
            {t("geocercas.subtitleNew", { defaultValue: "Dibuja una geocerca en el mapa y asígnala." })}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 md:flex md:items-center md:gap-2">
          <input
            type="text"
            className="col-span-2 rounded-lg bg-slate-900 border border-emerald-400/60 text-white font-semibold px-3 py-2 text-xs md:col-span-1 md:px-4 md:py-2.5 md:text-sm"
            placeholder={t("geocercas.placeholderName", { defaultValue: "Nombre de la geocerca" })}
            value={geofenceName}
            onChange={(e) => setGeofenceName(e.target.value)}
          />

          <button
            onClick={() => {
              setCoordText("");
              setCoordModalOpen(true);
            }}
            className="rounded-lg font-semibold bg-slate-800 text-slate-50 border border-slate-600 px-3 py-2 text-xs md:px-4 md:py-2.5 md:text-sm whitespace-nowrap"
            type="button"
          >
            {t("geocercas.buttonDrawByCoords", { defaultValue: "Dibujar por coordenadas" })}
          </button>

          <button
            onClick={handleSave}
            className="rounded-lg font-semibold bg-emerald-600 text-white px-3 py-2 text-xs md:px-4 md:py-2.5 md:text-sm whitespace-nowrap"
            type="button"
          >
            {t("geocercas.buttonSave", { defaultValue: "Guardar geocerca" })}
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col gap-3 lg:grid lg:grid-cols-4">
        <div className="bg-slate-900/80 rounded-xl border border-slate-700/80 p-3 flex flex-col min-h-0 max-h-[42svh] md:max-h-[32svh] lg:max-h-none">
          <h2 className="text-sm font-semibold text-slate-100 mb-2">
            {t("geocercas.panelTitle", { defaultValue: "Geocercas" })}
          </h2>

          <div className="flex-1 min-h-0 overflow-auto space-y-1 pr-1">
            {geofenceList.length === 0 && (
              <div className="text-xs text-slate-400">
                {t("geocercas.noGeofences", { defaultValue: "No hay geocercas." })}
              </div>
            )}

            {filterSoftDeleted(geofenceList).map((g) => (
              <label
                key={`${g.source}-${g.id || ""}-${g.nombre}`}
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

          <div className="mt-2 grid grid-cols-3 gap-2 md:mt-3 md:flex md:flex-col md:gap-2">
            <button
              onClick={handleShowSelected}
              className="w-full px-2 py-1.5 rounded-md text-[11px] font-semibold bg-sky-600 text-white md:px-3 md:py-1.5 md:text-xs"
              type="button"
            >
              {showLoading
                ? t("common.actions.loading", { defaultValue: "Cargando..." })
                : t("geocercas.buttonShowOnMap", { defaultValue: "Mostrar en mapa" })}
            </button>

            <button
              onClick={handleDeleteSelected}
              className="w-full px-2 py-1.5 rounded-md text-[11px] font-semibold bg-red-600 text-white md:px-3 md:py-1.5 md:text-xs"
              type="button"
            >
              {t("geocercas.buttonDeleteSelected", { defaultValue: "Eliminar seleccionadas" })}
            </button>

            <button
              onClick={() => {
                clearCanvas();
                setDraftFeature(null);
                setViewFeature(null);
                setViewCentroid(null);
                setBanner(null);
              }}
              className="w-full px-2 py-1.5 rounded-md text-[11px] font-medium bg-slate-800 text-slate-200 md:px-3 md:py-1.5 md:text-xs"
              type="button"
            >
              {t("geocercas.buttonClearCanvas", { defaultValue: "Limpiar mapa" })}
            </button>
          </div>

          {loadingDataset && (
            <div className="mt-2 md:mt-3 text-[11px] text-slate-400">
              {t("geocercas.loadingDataset", { defaultValue: "Cargando dataset..." })}
            </div>
          )}
          {datasetError && <div className="mt-2 md:mt-3 text-[11px] text-red-300">{datasetError}</div>}
        </div>

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

            {dataset && <GeoJSON data={dataset} {...pointStyle} />}
            <CursorPosLive setCursorLatLng={setCursorLatLng} />

            <Pane name="draftPane" style={{ zIndex: 650 }}>
              {draftFeature && (
                <GeoJSON
                  key={`draft-${draftId}`}
                  data={draftFeature}
                  style={() => ({ color: "#22c55e", weight: 3, fillColor: "#22c55e", fillOpacity: 0.35 })}
                />
              )}
            </Pane>

            <Pane name="viewPane" style={{ zIndex: 640 }}>
              {viewFeature && (
                <>
                  <GeoJSON
                    key={`view-${viewId}`}
                    data={viewFeature}
                    style={() => ({ color: "#38bdf8", weight: 3, fillColor: "#38bdf8", fillOpacity: 0.15 })}
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

          <div className="hidden md:block absolute right-3 top-3 z-[9999] space-y-2">
            <div className="px-3 py-1.5 rounded-md bg-black/70 text-[11px] text-slate-50 font-mono pointer-events-none">
              {cursorLatLng ? (
                <>
                  <span>Lat: {cursorLatLng.lat.toFixed(6)}</span>
                  <span className="ml-2">Lng: {cursorLatLng.lng.toFixed(6)}</span>
                </>
              ) : (
                <span>{t("geocercas.cursorHint", { defaultValue: "Mueve el cursor sobre el mapa" })}</span>
              )}
            </div>

            <div className="px-3 py-1.5 rounded-md bg-black/70 text-[11px] text-slate-50 font-mono pointer-events-none">
              Draft: {draftFeature ? "sí" : "no"} | Pts: {draftPointsCount}
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
                type="button"
              >
                {t("common.actions.cancel", { defaultValue: "Cancelar" })}
              </button>

              <button
                onClick={handleDrawFromCoords}
                className="px-3 py-1.5 rounded-md text-xs font-semibold bg-emerald-600 text-white"
                type="button"
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
