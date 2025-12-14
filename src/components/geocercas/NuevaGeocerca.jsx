// src/components/geocercas/NuevaGeocerca.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  FeatureGroup,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";

import "leaflet/dist/leaflet.css";

import { GeomanControls } from "react-leaflet-geoman-v2";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";

// ✅ RUTAS (ajústalas solo si tu estructura cambió)
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
        ...r,
        lat: parseFloat(r.lat),
        lon: parseFloat(r.lon),
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

  if (supabaseClient && orgId) {
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
          list.push({ key: k, nombre, source: "local" });
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

async function loadGeofenceGeometryByName({ name, supabaseClient = null }) {
  if (supabaseClient) {
    const { data, error } = await supabaseClient
      .from(SUPABASE_GEOFENCES_TABLE)
      .select("geojson, geometry, geom, polygon, lat, lng, radius_m, nombre")
      .eq("nombre", name)
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error("No existe esa geocerca");

    const shape =
      data.geojson || data.geometry || data.geom || data.polygon || null;
    if (shape) {
      const geo = typeof shape === "string" ? JSON.parse(shape) : shape;
      return geo;
    }

    if (data.lat != null && data.lng != null) {
      const lat = parseFloat(data.lat);
      const lng = parseFloat(data.lng);
      const radius = data.radius_m ? Number(data.radius_m) : null;

      if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
        if (radius && Number.isFinite(radius)) {
          // punto con radio en props (lo renderizamos como círculo en el mapa al dibujar desde listado)
          return {
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                properties: { nombre: name, radius_m: radius },
                geometry: { type: "Point", coordinates: [lng, lat] },
              },
            ],
          };
        }
        return {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: { nombre: name },
              geometry: { type: "Point", coordinates: [lng, lat] },
            },
          ],
        };
      }
    }

    throw new Error("Geocerca sin geometría utilizable");
  }

  if (typeof window !== "undefined") {
    const key = `geocerca_${name}`;
    const raw = localStorage.getItem(key);
    if (!raw) throw new Error("No existe esa geocerca local");
    const obj = JSON.parse(raw);
    const shape =
      obj?.geojson || obj?.geometry || obj?.geom || obj?.polygon || obj?.data || null;
    if (!shape) throw new Error("Geocerca local sin geometría");
    return typeof shape === "string" ? JSON.parse(shape) : shape;
  }

  throw new Error("No se pudo cargar geocerca");
}

function primaryFeatureFromGeoJSON(geojson) {
  if (!geojson) return null;

  if (geojson.type === "Feature") return geojson;

  if (
    geojson.type === "FeatureCollection" &&
    Array.isArray(geojson.features) &&
    geojson.features.length
  ) {
    return geojson.features[0];
  }

  if (geojson.type && geojson.coordinates) {
    return { type: "Feature", properties: {}, geometry: geojson };
  }

  return null;
}

function addSingleFeatureToFeatureGroup({ featureGroupRef, feature, name }) {
  const fg = featureGroupRef.current;
  if (!fg || !feature) return 0;

  const geom = feature.geometry;
  const props = feature.properties || {};
  if (!geom) return 0;

  // Point (si tiene radius_m, dibujamos un circle)
  if (geom.type === "Point" && Array.isArray(geom.coordinates)) {
    const [lng, lat] = geom.coordinates;
    const radius = props.radius_m || props.radius || null;

    let layer = null;
    if (radius && Number.isFinite(Number(radius))) {
      layer = L.circle([lat, lng], {
        radius: Number(radius),
        color: "#22c55e",
        fillColor: "#22c55e",
        fillOpacity: 0.25,
        weight: 2,
      });
    } else {
      layer = L.circleMarker([lat, lng], {
        radius: 6,
        color: "#22c55e",
        fillColor: "#22c55e",
        fillOpacity: 0.7,
        weight: 2,
      });
    }

    if (layer) {
      layer.bindTooltip(String(name || props.nombre || ""), {
        permanent: false,
        direction: "top",
        opacity: 0.9,
        className: "geofence-label",
      });
      fg.addLayer(layer);
      return 1;
    }
    return 0;
  }

  // Polígonos / líneas / multi*
  const layer = L.geoJSON(feature, {
    style: () => ({
      color: "#22c55e",
      weight: 2,
      fillColor: "#22c55e",
      fillOpacity: 0.2,
    }),
    onEachFeature: (_f, lyr) => {
      lyr.bindTooltip(String(name || props.nombre || ""), {
        permanent: false,
        direction: "top",
        opacity: 0.9,
        className: "geofence-label",
      });
    },
  });

  fg.addLayer(layer);
  return 1;
}

/* ----------------- Auxiliares ----------------- */

function fitFeatureGroup(map, featureGroupRef, { padding = [20, 20] } = {}) {
  if (!map || !featureGroupRef.current) return;
  const bounds = featureGroupRef.current.getBounds?.();
  if (bounds && bounds.isValid && bounds.isValid()) {
    map.fitBounds(bounds, { padding });
  }
}

function CursorPosLive({ setCursorLatLng }) {
  useMapEvents({
    mousemove(e) {
      setCursorLatLng({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

/* ----------------- Coordenadas → Feature (estado) ----------------- */

function parsePairsMulti(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const pairs = [];

  // soporta: "lat,lng" o "lat lng" por línea
  for (const line of lines) {
    const parts = line.split(/[,;\s]+/).filter(Boolean);
    if (parts.length < 2) continue;
    const lat = parseFloat(String(parts[0]).replace(",", "."));
    const lng = parseFloat(String(parts[1]).replace(",", "."));
    if (!Number.isNaN(lat) && !Number.isNaN(lng)) pairs.push([lng, lat]); // GeoJSON order
  }

  // fallback: todo en una línea
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

  if (pairs.length === 1) {
    coords = squareFromPoint(pairs[0]);
  } else if (pairs.length === 2) {
    coords = rectFromTwoPoints(pairs[0], pairs[1]);
  } else {
    coords = [...pairs];
    const first = coords[0];
    const last = coords[coords.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) coords.push(first);
  }

  return {
    type: "Feature",
    properties: {
      source: "coords",
      createdAt: new Date().toISOString(),
    },
    geometry: {
      type: "Polygon",
      coordinates: [coords],
    },
  };
}

/* ----------------- Componente principal ----------------- */

export default function NuevaGeocerca({ supabaseClient = supabase }) {
  const { currentOrg } = useAuth();
  const { t } = useTranslation();

  const [dataset, setDataset] = useState(null);
  const [loadingDataset, setLoadingDataset] = useState(!!DATA_SOURCE);
  const [datasetError, setDatasetError] = useState(null);

  const [geofenceList, setGeofenceList] = useState([]);
  const [selectedNames, setSelectedNames] = useState(new Set());

  const mapRef = useRef(null);

  // Canvas Geoman / geofences existentes
  const featureGroupRef = useRef(null);
  const selectedLayerRef = useRef(null);
  const lastCreatedLayerRef = useRef(null);

  // ✅ NUEVO: Dibujo por coordenadas se renderiza desde estado (no depende del canvas)
  const [draftFeature, setDraftFeature] = useState(null);

  const [cursorLatLng, setCursorLatLng] = useState(null);

  const [geofenceName, setGeofenceName] = useState("");
  const [coordModalOpen, setCoordModalOpen] = useState(false);
  const [coordText, setCoordText] = useState("");

  // ✅ Captura mapa SIEMPRE (evita “mapRef no listo”)
  const onMapReady = useCallback((map) => {
    mapRef.current = map;
  }, []);

  // ✅ Captura FeatureGroup Leaflet real
  const onFeatureGroupCreated = useCallback((fg) => {
    featureGroupRef.current = fg;
  }, []);

  /* ---- Cargar dataset externo opcional ---- */
  useEffect(() => {
    let isMounted = true;

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
        if (!isMounted) return;
        setDataset(data);
        setDatasetError(null);
      } catch (e) {
        if (!isMounted) return;
        setDataset(null);
        setDatasetError(e?.message || String(e));
      } finally {
        if (!isMounted) return;
        setLoadingDataset(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [supabaseClient]);

  const refreshGeofenceList = useCallback(async () => {
    try {
      if (!currentOrg?.id) {
        setGeofenceList([]);
        return;
      }
      const list = await listGeofences({ supabaseClient, orgId: currentOrg.id });
      setGeofenceList(list);
    } catch (err) {
      console.warn("[NuevaGeocerca] error al refrescar geofences:", err);
      setGeofenceList([]);
    }
  }, [supabaseClient, currentOrg]);

  useEffect(() => {
    refreshGeofenceList();
  }, [refreshGeofenceList]);

  /* ---- Operaciones sobre FeatureGroup ---- */

  const clearCanvas = useCallback(() => {
    featureGroupRef.current?.clearLayers?.();
    selectedLayerRef.current = null;
    lastCreatedLayerRef.current = null;
  }, []);

  const drawGeofences = useCallback(
    ({ names, zoom = true } = {}) => {
      if (!featureGroupRef.current) return 0;

      // OJO: no tocamos draftFeature (coords), solo el canvas de lista/geoman
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

      (async () => {
        if (supaNames.length && supabaseClient) {
          for (const nm of supaNames) {
            try {
              const geojson = await loadGeofenceGeometryByName({ name: nm, supabaseClient });
              const feature = primaryFeatureFromGeoJSON(geojson);
              if (feature) shown += addSingleFeatureToFeatureGroup({ featureGroupRef, feature, name: nm });
            } catch (e) {
              console.warn("No se pudo cargar geocerca", nm, e);
            }
          }
        }

        if (typeof window !== "undefined") {
          for (const nm of localNames) {
            try {
              const geojson = await loadGeofenceGeometryByName({ name: nm, supabaseClient: null });
              const feature = primaryFeatureFromGeoJSON(geojson);
              if (feature) shown += addSingleFeatureToFeatureGroup({ featureGroupRef, feature, name: nm });
            } catch (e) {
              console.warn("No se pudo cargar geocerca local", nm, e);
            }
          }
        }

        if (zoom && mapRef.current) {
          fitFeatureGroup(mapRef.current, featureGroupRef, { padding: [40, 40] });
        }
      })();

      return shown;
    },
    [geofenceList, supabaseClient, setDraftFeature]
  );

  /* ----------------- Geoman → (para guardar) ----------------- */

  const handleGeomanCreate = useCallback((e) => {
    const layer = e.layer;
    selectedLayerRef.current = layer;
    lastCreatedLayerRef.current = layer;

    // si el usuario dibuja con geoman, borramos el draft de coords para no confundir
    setDraftFeature(null);
  }, []);

  const handleGeomanEditUpdate = useCallback((e) => {
    if (e?.layer) {
      selectedLayerRef.current = e.layer;
      lastCreatedLayerRef.current = e.layer;
    }
  }, []);

  /* ----------------- Coordenadas → draftFeature (render) ----------------- */

  const handleDrawFromCoords = useCallback(() => {
    const text = coordText.trim();
    if (!text) return;

    const pairs = parsePairsMulti(text);
    if (!pairs.length) {
      alert(t("geocercas.errorCoordsInvalid"));
      return;
    }

    // Creamos feature polygon (1pt->cuadrado, 2pt->rect, 3+->polygon)
    const feature = featureFromCoords(pairs);
    setDraftFeature(feature);

    // limpiamos canvas geoman/lista para que se vea solo el draft si quieres
    clearCanvas();
    selectedLayerRef.current = null;
    lastCreatedLayerRef.current = null;

    // zoom al draft
    const map = mapRef.current;
    if (map) {
      try {
        const bounds = L.geoJSON(feature).getBounds();
        if (bounds?.isValid?.()) map.fitBounds(bounds, { padding: [40, 40] });
      } catch {
        // ignore
      }
    }

    setCoordModalOpen(false);
    setCoordText("");
  }, [coordText, clearCanvas, t]);

  /* ----------------- Guardar (coords o geoman) ----------------- */

  const saveGeofenceCollection = useCallback(
    async ({ name }) => {
      const payloadName = String(name || "").trim();
      if (!payloadName) throw new Error(t("geocercas.errorNameRequired"));

      // 1) Prioridad: si hay draftFeature (coords), se guarda eso
      if (draftFeature) {
        const geo = {
          type: "FeatureCollection",
          features: [draftFeature],
        };

        // local
        if (typeof window !== "undefined") {
          localStorage.setItem(
            `geocerca_${payloadName}`,
            JSON.stringify({
              nombre: payloadName,
              geojson: geo,
              updated_at: new Date().toISOString(),
            })
          );
        }

        // supabase
        if (supabaseClient && currentOrg?.id) {
          const insertPayload = {
            nombre: payloadName,
            org_id: currentOrg.id,
            geojson: geo,
          };

          const { error } = await supabaseClient
            .from(SUPABASE_GEOFENCES_TABLE)
            .upsert(insertPayload, { onConflict: "org_id,nombre" });

          if (error) throw error;
        }

        return true;
      }

      // 2) Si no hay draft, guardamos lo dibujado por geoman/lista (Leaflet layer)
      const fg = featureGroupRef.current;
      if (!fg) throw new Error(t("geocercas.errorNoShape"));

      let layerToSave = selectedLayerRef.current || lastCreatedLayerRef.current;

      if (!layerToSave) {
        const layers = [];
        fg.eachLayer((lyr) => layers.push(lyr));
        layerToSave = layers[layers.length - 1] || null;
      }

      if (!layerToSave || typeof layerToSave.toGeoJSON !== "function") {
        throw new Error(t("geocercas.errorNoShape"));
      }

      const feature = layerToSave.toGeoJSON();
      const geo = {
        type: "FeatureCollection",
        features: [feature],
      };

      if (typeof window !== "undefined") {
        localStorage.setItem(
          `geocerca_${payloadName}`,
          JSON.stringify({
            nombre: payloadName,
            geojson: geo,
            updated_at: new Date().toISOString(),
          })
        );
      }

      if (supabaseClient && currentOrg?.id) {
        const insertPayload = {
          nombre: payloadName,
          org_id: currentOrg.id,
          geojson: geo,
        };

        const { error } = await supabaseClient
          .from(SUPABASE_GEOFENCES_TABLE)
          .upsert(insertPayload, { onConflict: "org_id,nombre" });

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
      // opcional: limpiar draft al guardar
      setDraftFeature(null);
    } catch (e) {
      console.error("Error en handleSave geocerca:", e);
      const rawMsg = e?.message || String(e);
      const translated = t("geocercas.errorSave", { error: rawMsg });
      alert(translated === "geocercas.errorSave" ? rawMsg : translated);
    }
  }, [geofenceName, saveGeofenceCollection, refreshGeofenceList, t]);

  /* ----------------- UI helpers ----------------- */

  const openCoordModal = useCallback(() => {
    setCoordText("");
    setCoordModalOpen(true);
  }, []);

  const closeCoordModal = useCallback(() => {
    setCoordModalOpen(false);
  }, []);

  const handleSelectGeofence = useCallback(
    (nombre) => {
      const newSet = new Set(selectedNames);
      if (newSet.has(nombre)) newSet.delete(nombre);
      else newSet.add(nombre);
      setSelectedNames(newSet);
    },
    [selectedNames]
  );

  const handleShowSelected = useCallback(() => {
    if (!selectedNames.size) {
      alert(t("geocercas.errorSelectAtLeastOne"));
      return;
    }
    // mostrar selección, no tocamos draftFeature
    drawGeofences({ names: Array.from(selectedNames), zoom: true });
  }, [selectedNames, drawGeofences, t]);

  const handleShowAll = useCallback(() => {
    drawGeofences({ names: geofenceList.map((g) => g.nombre), zoom: true });
  }, [geofenceList, drawGeofences]);

  const handleDeleteSelected = useCallback(async () => {
    if (!selectedNames.size) {
      alert(t("geocercas.errorSelectAtLeastOne"));
      return;
    }
    if (!window.confirm(t("geocercas.deleteConfirm"))) return;

    const items = geofenceList.filter((g) => selectedNames.has(g.nombre));

    try {
      const deletedCount = await deleteGeofences({ items, supabaseClient });
      alert(t("geocercas.deletedCount", { count: deletedCount }));
      setSelectedNames(new Set());
      await refreshGeofenceList();
      clearCanvas();
    } catch (e) {
      alert(t("geocercas.errorDelete", { error: e?.message || String(e) }));
    }
  }, [selectedNames, geofenceList, supabaseClient, refreshGeofenceList, clearCanvas, t]);

  const pointStyle = useMemo(
    () => ({
      pointToLayer: (_feature, latlng) =>
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

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-140px)]">
      {/* TOP BAR */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-100">
            {t("geocercas.titleNew")}
          </h1>
          <p className="text-xs text-slate-300">{t("geocercas.subtitleNew")}</p>
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
              onClick={() => {
                clearCanvas();
                setDraftFeature(null);
              }}
              className="w-full px-3 py-1.5 rounded-md text-xs font-medium bg-slate-800 text-slate-200 hover:bg-slate-700"
            >
              {t("geocercas.buttonClearCanvas")}
            </button>
          </div>

          {loadingDataset && (
            <div className="mt-3 text-[11px] text-slate-400">
              {t("geocercas.loadingDataset")}
            </div>
          )}
          {datasetError && (
            <div className="mt-3 text-[11px] text-red-300">
              {t("geocercas.errorDataset", { error: datasetError })}
            </div>
          )}
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

            {/* Puntos (si DATA_SOURCE está activo) */}
            {dataset && <GeoJSON data={dataset} {...pointStyle} key="points-layer" />}

            {/* Lat/Lng vivos */}
            <CursorPosLive setCursorLatLng={setCursorLatLng} />

            {/* ✅ Dibujo por coordenadas: renderizado desde estado (independiente del canvas) */}
            {draftFeature && (
              <GeoJSON
                data={draftFeature}
                style={() => ({
                  color: "#22c55e",
                  weight: 2,
                  fillColor: "#22c55e",
                  fillOpacity: 0.3,
                })}
              />
            )}

            {/* Canvas Geoman + lista */}
            <FeatureGroup whenCreated={onFeatureGroupCreated}>
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
                onCreate={handleGeomanCreate}
                onEdit={handleGeomanEditUpdate}
                onUpdate={handleGeomanEditUpdate}
              />
            </FeatureGroup>
          </MapContainer>

          {/* Lat/Lng visible sobre mapa */}
          <div className="absolute right-3 top-3 z-[9999] px-3 py-1.5 rounded-md bg-black/70 text-[11px] text-slate-50 font-mono pointer-events-none">
            {cursorLatLng ? (
              <>
                <span>Lat: {cursorLatLng.lat.toFixed(6)}</span>
                <span className="ml-2">Lng: {cursorLatLng.lng.toFixed(6)}</span>
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
              <span className="font-mono text-[11px]">-0.180653, -78.467838</span>
              <br />
              <span className="text-[11px] text-slate-500">
                (1 por línea: lat,lng). 2 puntos = rectángulo. 3+ = polígono.
              </span>
            </p>

            <textarea
              rows={5}
              className="w-full rounded-md bg-slate-950 border border-slate-700 text-xs text-slate-100 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              value={coordText}
              onChange={(e) => setCoordText(e.target.value)}
              placeholder={`-0.074624, -78.474352\n-0.070075, -78.464546\n-0.065398, -78.466928`}
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