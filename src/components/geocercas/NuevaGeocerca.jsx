// src/components/geocercas/NuevaGeocerca.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, FeatureGroup, Pane, useMapEvents } from "react-leaflet";
import L from "leaflet";

import "leaflet/dist/leaflet.css";
import { GeomanControls } from "react-leaflet-geoman-v2";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";

import { useAuthSafe } from "@/auth/AuthProvider.jsx";
import { useTranslation } from "react-i18next";

import { listGeofences, getGeofence, upsertGeofence, deleteGeofence } from "../../lib/geofencesApi.js";

/**
 * DATASET opcional:
 * - null: no carga dataset
 * - 'geojson' | 'csv'
 */
const DATA_SOURCE = null;
const GEOJSON_URL = "/data/mapa_corto_214.geojson";
const CSV_URL = "/data/mapa_corto_214.csv";

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

/* ----------------------------- Cursor live ----------------------------- */
function CursorPosLive({ setCursorLatLng }) {
  useMapEvents({
    mousemove: (e) => setCursorLatLng(e.latlng),
    mouseout: () => setCursorLatLng(null),
  });
  return null;
}

/* ----------------------------- GeoJSON utils ----------------------------- */
function ensureFeatureCollection(input) {
  if (!input) return null;
  if (input.type === "FeatureCollection") return input;
  if (input.type === "Feature") return { type: "FeatureCollection", features: [input] };
  if (input.type && input.coordinates) {
    return { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: input }] };
  }
  return null;
}

function normalizeGeojson(input) {
  return ensureFeatureCollection(input);
}

function combineFeatureCollections(list) {
  const items = (list || []).map(ensureFeatureCollection).filter(Boolean);
  if (!items.length) return null;
  const features = items.flatMap((fc) => fc.features || []).filter(Boolean);
  return { type: "FeatureCollection", features };
}

function centroidFeatureFromGeojson(fc) {
  try {
    const gj = ensureFeatureCollection(fc);
    if (!gj) return null;
    const layer = L.geoJSON(gj);
    const bounds = layer.getBounds();
    if (!bounds?.isValid?.()) return null;
    const c = bounds.getCenter();
    return { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [c.lng, c.lat] } }] };
  } catch {
    return null;
  }
}

function parsePairs(text) {
  const lines = String(text || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const out = [];
  for (const line of lines) {
    const parts = line.split(",").map((x) => x.trim());
    if (parts.length < 2) continue;
    const lat = Number(parts[0]);
    const lng = Number(parts[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    out.push([lng, lat]); // GeoJSON expects [lng,lat]
  }
  return out;
}

function featureFromCoords(lngLatPairs) {
  const coords = Array.isArray(lngLatPairs) ? lngLatPairs : [];
  if (coords.length === 1) {
    const [lng, lat] = coords[0];
    return { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [lng, lat] } };
  }
  if (coords.length === 2) {
    // build rectangle from 2 points
    const [a, b] = coords;
    const minLng = Math.min(a[0], b[0]);
    const maxLng = Math.max(a[0], b[0]);
    const minLat = Math.min(a[1], b[1]);
    const maxLat = Math.max(a[1], b[1]);
    const ring = [
      [minLng, minLat],
      [maxLng, minLat],
      [maxLng, maxLat],
      [minLng, maxLat],
      [minLng, minLat],
    ];
    return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } };
  }
  // polygon (ensure closed)
  const ring = [...coords];
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (!last || last[0] !== first[0] || last[1] !== first[1]) ring.push(first);
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } };
}

function getLastGeomanLayer(map) {
  if (!map) return null;
  let last = null;
  map.eachLayer((l) => {
    if (l && typeof l.toGeoJSON === "function" && l.pm) last = l;
  });
  return last;
}

/* ----------------------------- Component ----------------------------- */
export default function NuevaGeocerca() {
  const { t } = useTranslation();
  const { currentOrg } = useAuthSafe();

  const mapRef = useRef(null);
  const featureGroupRef = useRef(null);
  const selectedLayerRef = useRef(null);
  const lastCreatedLayerRef = useRef(null);

  const [banner, setBanner] = useState(null);
  const [geofenceName, setGeofenceName] = useState("");
  const [geofenceList, setGeofenceList] = useState([]);
  const [selectedNames, setSelectedNames] = useState(new Set());
  const [lastSelectedName, setLastSelectedName] = useState(null);

  const [coordModalOpen, setCoordModalOpen] = useState(false);
  const [coordText, setCoordText] = useState("");

  const [cursorLatLng, setCursorLatLng] = useState(null);

  const [draftFeature, setDraftFeature] = useState(null);
  const [draftId, setDraftId] = useState(0);

  const [viewFeature, setViewFeature] = useState(null);
  const [viewCentroid, setViewCentroid] = useState(null);
  const [viewId, setViewId] = useState(0);

  const [dataset, setDataset] = useState(null);
  const [loadingDataset, setLoadingDataset] = useState(false);
  const [datasetError, setDatasetError] = useState("");

  const [showLoading, setShowLoading] = useState(false);

  const showErr = useCallback((msg, err) => {
    try {
      console.error("[NuevaGeocerca] ", msg, err);
    } catch {}
    setBanner({ type: "error", text: String(msg || "Error") });
  }, []);

  const showOk = useCallback((msg) => {
    setBanner({ type: "ok", text: String(msg || "OK") });
  }, []);

  const clearCanvas = useCallback(() => {
    const fg = featureGroupRef.current;
    if (fg && fg.clearLayers) {
      try {
        fg.clearLayers();
      } catch {}
    }
    selectedLayerRef.current = null;
    lastCreatedLayerRef.current = null;
  }, []);

  const refreshGeofenceList = useCallback(async () => {
    const orgId = currentOrg?.id || null;
    if (!orgId) return;
    const items = await listGeofences({ orgId, onlyActive: true, limit: 500 });

    // Normalizamos nombre: name (preferido) y fallback legacy
    const normalized = (items || [])
      .map((x) => ({
        ...x,
        name: x?.name ?? x?.nombre ?? "",
      }))
      .filter((x) => String(x.name || "").trim());

    normalized.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    setGeofenceList(normalized);
  }, [currentOrg?.id]);

  useEffect(() => {
    refreshGeofenceList().catch(() => {});
  }, [refreshGeofenceList]);

  useEffect(() => {
    if (!DATA_SOURCE) return;
    let url = null;
    if (DATA_SOURCE === "geojson") url = GEOJSON_URL;
    if (DATA_SOURCE === "csv") url = CSV_URL;
    if (!url) return;

    (async () => {
      setLoadingDataset(true);
      setDatasetError("");
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        if (DATA_SOURCE === "geojson") {
          const gj = await res.json();
          setDataset(gj);
        } else {
          setDataset(null);
        }
      } catch (e) {
        setDatasetError(String(e?.message || e));
      } finally {
        setLoadingDataset(false);
      }
    })();
  }, []);

  const scheduleFitToGeo = useCallback((geo) => {
    const map = mapRef.current;
    if (!map || !geo) return;

    const run = () => {
      try {
        const fc = ensureFeatureCollection(geo);
        if (!fc) return;
        const bounds = L.geoJSON(fc).getBounds();
        if (bounds?.isValid?.()) map.fitBounds(bounds, { padding: [40, 40] });
      } catch {}
    };

    try {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          try {
            map.invalidateSize?.();
          } catch {}
          run();
        });
      });
    } catch {
      setTimeout(() => {
        try {
          map.invalidateSize?.();
        } catch {}
        run();
      }, 0);
    }
  }, []);

  useEffect(() => {
    if (!viewFeature) return;
    scheduleFitToGeo(viewFeature);
  }, [viewId, viewFeature, scheduleFitToGeo]);

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
    scheduleFitToGeo(feature);

    setCoordModalOpen(false);
    setCoordText("");
    showOk(t("geocercas.coordsReady", { defaultValue: "Figura creada desde coordenadas." }));
  }, [coordText, clearCanvas, t, showErr, showOk, scheduleFitToGeo]);

  const handleSave = useCallback(async () => {
    try {
      const nm = String(geofenceName || "").trim();
      if (!nm) {
        showErr(t("geocercas.errorNameRequired", { defaultValue: "Escribe un nombre para la geocerca." }));
        return;
      }

      const orgId = currentOrg?.id || null;
      if (!orgId) {
        showErr(t("geocercas.manage.noOrgTitle", { defaultValue: "Org no disponible." }));
        return;
      }

      // Construir FeatureCollection
      let fc = null;

      if (draftFeature) {
        fc = { type: "FeatureCollection", features: [draftFeature] };
      } else {
        const map = mapRef.current;
        const layerToSave =
          selectedLayerRef.current || lastCreatedLayerRef.current || getLastGeomanLayer(map);

        if (!layerToSave || typeof layerToSave.toGeoJSON !== "function") {
          showErr(
            t("geocercas.errorNoShape", {
              defaultValue: "Dibuja una geocerca o crea una por coordenadas antes de guardar.",
            })
          );
          return;
        }

        fc = { type: "FeatureCollection", features: [layerToSave.toGeoJSON()] };
      }

      // Optimistic list (por nombre)
      setGeofenceList((prev) => {
        const optimistic = { id: `optim-${Date.now()}`, name: nm, _optimistic: true };
        const next = [optimistic, ...(prev || [])];
        const seen = new Set();
        const unique = [];
        for (const g of next) {
          const key = String(g?.name || "").trim();
          if (!key) continue;
          if (seen.has(key)) continue;
          seen.add(key);
          unique.push(g);
        }
        unique.sort((a, b) => String(a.name).localeCompare(String(b.name)));
        return unique;
      });

      // ✅ Insert/Update en geofences
      // IMPORTANT:
      // - polygon_geojson obligatorio
      // - radius_m NOT NULL (aunque sea polígono)
      await upsertGeofence({
        name: nm,
        polygon_geojson: fc,
        radius_m: 0,
        active: true,
      });

      clearCanvas();
      setDraftFeature(null);

      setViewFeature(fc);
      setViewCentroid(centroidFeatureFromGeojson(fc));
      setViewId((x) => x + 1);

      await refreshGeofenceList();
      setGeofenceName("");
      showOk(t("geocercas.savedOk", { defaultValue: "Geocerca guardada correctamente." }));
    } catch (e) {
      showErr(t("geocercas.errorSave", { defaultValue: "No se pudo guardar la geocerca. Intenta nuevamente." }), e);
      try {
        await refreshGeofenceList();
      } catch {}
    }
  }, [geofenceName, currentOrg?.id, draftFeature, t, refreshGeofenceList, showErr, showOk, clearCanvas]);

  const handleDeleteSelected = useCallback(async () => {
    if (!selectedNames || selectedNames.size === 0) {
      showErr(t("geocercas.errorSelectAtLeastOne", { defaultValue: "Selecciona al menos una geocerca." }));
      return;
    }

    const confirmed = window.confirm(
      t("geocercas.deleteConfirm", { defaultValue: "¿Eliminar las geocercas seleccionadas?" })
    );
    if (!confirmed) return;

    const orgId = currentOrg?.id || null;
    const names = Array.from(selectedNames).map((x) => String(x || "").trim()).filter(Boolean);

    try {
      // Borrado: por id (en geofences no tenemos bulk por nombres acá)
      for (const nm of names) {
        const row = geofenceList.find((g) => String(g.name) === nm);
        const id = row?.id;
        if (!orgId || !id || String(id).startsWith("optim-")) continue;
        await deleteGeofence({ orgId, id });
      }

      setSelectedNames(() => new Set());
      setLastSelectedName(null);
      setViewFeature(null);
      setViewCentroid(null);

      await refreshGeofenceList();
      clearCanvas();
      setDraftFeature(null);

      showOk(t("geocercas.deletedCount", { count: names.length, defaultValue: `Eliminadas: ${names.length}` }));
    } catch (e) {
      showErr(t("geocercas.deleteError", { defaultValue: "No se pudo eliminar. Intenta nuevamente." }), e);
    }
  }, [selectedNames, currentOrg?.id, refreshGeofenceList, clearCanvas, t, showErr, showOk, geofenceList]);

  const handleShowSelected = useCallback(async () => {
    setShowLoading(true);
    try {
      const orgId = currentOrg?.id || null;

      const selected = Array.from(selectedNames || [])
        .map((x) => String(x || "").trim())
        .filter(Boolean);

      let namesToShow = selected;
      if (namesToShow.length === 0) {
        const one = lastSelectedName || geofenceList?.[0]?.name || null;
        if (!one) {
          showErr(t("geocercas.errorSelectAtLeastOne", { defaultValue: "Selecciona al menos una geocerca." }));
          return;
        }
        namesToShow = [one];
      }

      const items = namesToShow.map((nm) => geofenceList.find((g) => String(g.name) === nm)).filter(Boolean);
      if (!items.length) return;

      const geos = [];
      for (const item of items) {
        if (!orgId || !item.id || String(item.id).startsWith("optim-")) continue;
        const row = await getGeofence({ id: item.id, orgId });

        // preferimos polygon_geojson; fallback si tu tabla tiene geometry/geojson
        const geo = normalizeGeojson(row?.polygon_geojson || row?.geojson || row?.geometry);
        if (geo) geos.push(geo);
      }

      const combined = combineFeatureCollections(geos);
      if (!combined) {
        showErr(t("geocercas.errorNoGeojson", { defaultValue: "No se encontró el GeoJSON." }));
        return;
      }

      clearCanvas();
      setDraftFeature(null);

      setViewFeature(combined);
      setViewCentroid(centroidFeatureFromGeojson(combined));
      setViewId((x) => x + 1);

      if (items.length > 1) {
        showOk(t("geocercas.showManyOk", { defaultValue: `Mostrando ${items.length} geocercas.` }));
      }
    } catch (e) {
      showErr(t("geocercas.errorLoad", { defaultValue: "No se pudo cargar la geocerca." }), e);
    } finally {
      setShowLoading(false);
    }
  }, [selectedNames, lastSelectedName, geofenceList, currentOrg?.id, t, showErr, showOk, clearCanvas]);

  const pointStyle = useMemo(
    () => ({
      pointToLayer: (_feature, latlng) => L.circleMarker(latlng, { radius: 4, weight: 1, opacity: 1, fillOpacity: 0.8 }),
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

  const handleClearMap = useCallback(() => {
    clearCanvas();
    setDraftFeature(null);
    setViewFeature(null);
    setViewCentroid(null);
    setBanner(null);
    setViewId((x) => x + 1);

    const map = mapRef.current;
    if (!map) return;
    try {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          try {
            map.invalidateSize?.();
          } catch {}
        });
      });
    } catch {
      setTimeout(() => {
        try {
          map.invalidateSize?.();
        } catch {}
      }, 0);
    }
  }, [clearCanvas]);

  return (
    <div className="flex flex-col gap-2 sm:gap-3 h-[calc(100svh-140px)] lg:h-[calc(100vh-140px)]">
      <Banner banner={banner} onClose={() => setBanner(null)} />

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div className="space-y-0.5">
          <h1 className="text-xl sm:text-2xl font-semibold text-slate-100">{t("geocercas.titleNew")}</h1>
          <p className="hidden md:block text-xs text-slate-300">{t("geocercas.subtitleNew")}</p>
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
            type="button"
          >
            {t("geocercas.buttonDrawByCoords")}
          </button>

          <button
            onClick={handleSave}
            className="rounded-lg font-semibold bg-emerald-600 text-white px-3 py-2 text-xs md:px-4 md:py-2.5 md:text-sm whitespace-nowrap"
            type="button"
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
            {geofenceList.length === 0 && <div className="text-xs text-slate-400">{t("geocercas.noGeofences")}</div>}

            {geofenceList.map((g) => (
              <label
                key={`api-${g.id || ""}-${g.name}`}
                className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-slate-800 md:px-2 md:py-1.5"
              >
                <input
                  type="checkbox"
                  checked={selectedNames.has(g.name)}
                  onChange={() => {
                    setSelectedNames((prev) => {
                      const next = new Set(prev);
                      if (next.has(g.name)) next.delete(g.name);
                      else next.add(g.name);
                      return next;
                    });
                    setLastSelectedName(g.name);
                  }}
                />
                <span className="text-[11px] md:text-xs text-slate-100">{g.name}</span>
              </label>
            ))}
          </div>

          <div className="mt-2 grid grid-cols-3 gap-2 md:mt-3 md:flex md:flex-col md:gap-2">
            <button
              onClick={handleShowSelected}
              className="w-full px-2 py-1.5 rounded-md text-[11px] font-semibold bg-sky-600 text-white md:px-3 md:py-1.5 md:text-xs"
              type="button"
            >
              {showLoading ? t("common.actions.loading", { defaultValue: "Cargando..." }) : t("geocercas.buttonShowOnMap", { defaultValue: "Mostrar en mapa" })}
            </button>

            <button
              onClick={handleDeleteSelected}
              className="w-full px-2 py-1.5 rounded-md text-[11px] font-semibold bg-red-600 text-white md:px-3 md:py-1.5 md:text-xs"
              type="button"
            >
              {t("geocercas.buttonDeleteSelected")}
            </button>

            <button
              onClick={handleClearMap}
              className="w-full px-2 py-1.5 rounded-md text-[11px] font-medium bg-slate-800 text-slate-200 md:px-3 md:py-1.5 md:text-xs"
              type="button"
            >
              {t("geocercas.buttonClearCanvas")}
            </button>
          </div>

          {loadingDataset && (
            <div className="mt-2 md:mt-3 text-[11px] text-slate-400">
              {t("geocercas.loadingDataset", { defaultValue: "Cargando dataset..." })}
            </div>
          )}
          {datasetError && <div className="mt-2 md:mt-3 text-[11px] text-red-300">{datasetError}</div>}
        </div>

        {/* Map */}
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
              {t("geocercas.modalHintRule", { defaultValue: "1 punto = cuadrado pequeño | 2 puntos = rectángulo | 3+ = polígono" })}
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