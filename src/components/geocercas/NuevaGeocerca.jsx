// src/components/geocercas/NuevaGeocerca.jsx
/* =========================================================
   Geocercas (API-first, cookie tg_at)
   - NO supabase-js para geocercas en browser
   - Todo CRUD por /api/geocercas
   - NO alert(e.message) => evita popup "Supabase error"
========================================================= */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, FeatureGroup, GeoJSON, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Geoman (si ya lo usas en el proyecto)
import "@geoman-io/leaflet-geoman-free";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";

import { useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthContext.jsx";

// API wrapper oficial (tuya)
import { listGeocercas, getGeocerca, upsertGeocerca, deleteGeocerca } from "../../lib/geocercasApi.js";

/* =========================================================
   Helpers UI
========================================================= */
function Banner({ banner, onClose }) {
  if (!banner) return null;
  const bg =
    banner.type === "error"
      ? "bg-red-900/60 border-red-500/50 text-red-100"
      : banner.type === "ok"
      ? "bg-emerald-900/60 border-emerald-500/50 text-emerald-100"
      : "bg-slate-900/60 border-slate-500/50 text-slate-100";

  return (
    <div className={`rounded-xl border px-3 py-2 text-sm flex items-start justify-between gap-3 ${bg}`}>
      <div className="leading-snug">{banner.text}</div>
      <button
        className="px-2 py-1 rounded-md bg-black/20 hover:bg-black/30 text-xs font-semibold"
        onClick={onClose}
      >
        OK
      </button>
    </div>
  );
}

function MapInvalidate() {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 50);
    return () => clearTimeout(t);
  }, [map]);
  return null;
}

/* =========================================================
   Geo helpers
========================================================= */
function normalizeNombreCi(nombre) {
  return String(nombre || "").trim().toLowerCase();
}

function normalizeGeojson(input) {
  if (!input) return null;
  if (input.type === "FeatureCollection") return input;
  if (input.type === "Feature") return { type: "FeatureCollection", features: [input] };
  return null;
}

function centroidFromFeatureCollection(fc) {
  try {
    const layer = L.geoJSON(fc);
    const b = layer.getBounds();
    if (b?.isValid?.()) {
      const c = b.getCenter();
      return { lat: c.lat, lng: c.lng };
    }
  } catch {}
  return null;
}

function parsePairs(text) {
  const rows = String(text || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  const out = [];
  for (const r of rows) {
    const m = r.split(/[,\s]+/).map((x) => x.trim());
    if (m.length < 2) continue;
    const lat = Number(m[0]);
    const lng = Number(m[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    out.push([lng, lat]);
  }
  return out;
}

// 1 punto -> cuadrado pequeño, 2 puntos -> rect, 3+ -> polígono
function featureFromCoords(pairs) {
  if (!pairs?.length) return null;

  if (pairs.length === 1) {
    const [lng, lat] = pairs[0];
    const d = 0.00015;
    const ring = [
      [lng - d, lat - d],
      [lng + d, lat - d],
      [lng + d, lat + d],
      [lng - d, lat + d],
      [lng - d, lat - d],
    ];
    return {
      type: "Feature",
      properties: {},
      geometry: { type: "Polygon", coordinates: [ring] },
    };
  }

  if (pairs.length === 2) {
    const [a, b] = pairs;
    const lng1 = Math.min(a[0], b[0]);
    const lng2 = Math.max(a[0], b[0]);
    const lat1 = Math.min(a[1], b[1]);
    const lat2 = Math.max(a[1], b[1]);
    const ring = [
      [lng1, lat1],
      [lng2, lat1],
      [lng2, lat2],
      [lng1, lat2],
      [lng1, lat1],
    ];
    return {
      type: "Feature",
      properties: {},
      geometry: { type: "Polygon", coordinates: [ring] },
    };
  }

  // 3+ -> polygon (cerramos)
  const ring = [...pairs];
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push(first);

  return {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [ring] },
  };
}

/* =========================================================
   Component
========================================================= */
export default function NuevaGeocerca() {
  const { t } = useTranslation();
  const { currentOrg } = useAuth();

  const mapRef = useRef(null);
  const fgRef = useRef(null);

  const [banner, setBanner] = useState(null);

  const [geofenceName, setGeofenceName] = useState("");
  const [geofenceList, setGeofenceList] = useState([]);
  const [loadingList, setLoadingList] = useState(false);

  const [selectedNames, setSelectedNames] = useState(() => new Set());
  const [lastSelectedName, setLastSelectedName] = useState(null);

  const [viewFeature, setViewFeature] = useState(null);

  const [coordModalOpen, setCoordModalOpen] = useState(false);
  const [coordText, setCoordText] = useState("");

  const orgId = currentOrg?.id || null;

  const showOk = useCallback((text) => setBanner({ type: "ok", text }), []);
  const showErr = useCallback((text, err) => {
    // Log técnico en consola, pero NO popup con mensaje crudo
    if (err) console.error("[Geocercas]", text, err);
    setBanner({ type: "error", text });
  }, []);

  const refreshList = useCallback(async () => {
    if (!orgId) {
      setGeofenceList([]);
      return;
    }
    setLoadingList(true);
    try {
      const items = await listGeocercas({ orgId, onlyActive: true });
      // Normalizamos a {id,nombre,nombre_ci}
      const mapped = (items || []).map((x) => ({
        id: x.id,
        nombre: x.nombre,
        nombre_ci: x.nombre_ci || normalizeNombreCi(x.nombre),
        source: "api",
      }));
      mapped.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));
      setGeofenceList(mapped);
    } catch (e) {
      // Importante: no popup, y NO “Supabase error”
      showErr(t("geocercas.list.loadError", { defaultValue: "No se pudo cargar el listado de geocercas." }), e);
      setGeofenceList([]);
    } finally {
      setLoadingList(false);
    }
  }, [orgId, showErr, t]);

  useEffect(() => {
    refreshList();
  }, [refreshList]);

  /* =========================================================
     Geoman setup (enable draw/edit)
  ========================================================= */
  useEffect(() => {
    const map = mapRef.current;
    const fg = fgRef.current;
    if (!map || !fg) return;

    // Evita doble init
    if (map.__pm_inited) return;
    map.__pm_inited = true;

    // Config
    map.pm.setLang("es");
    map.pm.addControls({
      position: "topleft",
      drawCircle: false,
      drawCircleMarker: false,
      drawMarker: false,
      drawText: false,
      drawPolyline: false,
      drawRectangle: true,
      drawPolygon: true,
      editMode: true,
      dragMode: true,
      cutPolygon: false,
      removalMode: true,
    });

    // Cuando se crea una capa, la metemos al FeatureGroup
    map.on("pm:create", (e) => {
      try {
        fg.addLayer(e.layer);
      } catch {}
    });

    return () => {
      try {
        map.off("pm:create");
      } catch {}
    };
  }, []);

  /* =========================================================
     Save
  ========================================================= */
  const getCurrentDrawnFeatureCollection = useCallback(() => {
    const fg = fgRef.current;
    if (!fg) return null;

    const layers = [];
    fg.eachLayer((layer) => layers.push(layer));

    if (!layers.length) return null;

    // Tomamos el último layer dibujado
    const last = layers[layers.length - 1];
    if (!last?.toGeoJSON) return null;

    const feat = last.toGeoJSON();
    return normalizeGeojson(feat);
  }, []);

  const handleSave = useCallback(async () => {
    if (!orgId) {
      showErr(t("geocercas.manage.noOrgTitle", { defaultValue: "Selecciona una organización antes de guardar." }));
      return;
    }

    const nm = geofenceName.trim();
    if (!nm) {
      showErr(t("geocercas.errorNameRequired", { defaultValue: "Escribe un nombre para la geocerca." }));
      return;
    }

    // Desde coordenadas o desde dibujo
    let fc = null;

    if (coordModalOpen === false) {
      // intentar desde dibujo
      fc = getCurrentDrawnFeatureCollection();
    }

    // si no hay fc, y hay coords modal, usamos coords
    if (!fc) {
      const pairs = parsePairs(coordText);
      if (pairs.length) {
        const feat = featureFromCoords(pairs);
        fc = normalizeGeojson(feat);
      }
    }

    if (!fc) {
      showErr(
        t("geocercas.errorNoShape", {
          defaultValue: "Dibuja una geocerca o usa coordenadas antes de guardar.",
        })
      );
      return;
    }

    // Optimistic insert (sin popup)
    setGeofenceList((prev) => {
      const byName = new Map();
      for (const g of prev || []) byName.set(g.nombre, g);
      if (!byName.has(nm)) byName.set(nm, { id: null, nombre: nm, nombre_ci: normalizeNombreCi(nm), source: "api" });
      const arr = Array.from(byName.values());
      arr.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));
      return arr;
    });

    try {
      await upsertGeocerca({
        org_id: orgId,
        nombre: nm,
        nombre_ci: normalizeNombreCi(nm),
        geojson: fc,
        geometry: fc,
        activo: true,
      });

      // Refresh real
      await refreshList();

      // Mostrar en mapa
      setViewFeature(fc);
      const c = centroidFromFeatureCollection(fc);
      if (c && mapRef.current) {
        try {
          const bounds = L.geoJSON(fc).getBounds();
          if (bounds?.isValid?.()) mapRef.current.fitBounds(bounds, { padding: [40, 40] });
        } catch {}
      }

      showOk(t("geocercas.savedOk", { defaultValue: "Geocerca guardada correctamente." }));
      setGeofenceName("");
      setCoordText("");
      setCoordModalOpen(false);
    } catch (e) {
      // Revert optimistic? (dejamos refreshList como fuente de verdad)
      await refreshList();

      // NO mostramos e.message (evita “Supabase error”)
      showErr(t("geocercas.errorSave", { defaultValue: "No se pudo guardar la geocerca. Intenta nuevamente." }), e);
    }
  }, [
    orgId,
    geofenceName,
    coordText,
    coordModalOpen,
    getCurrentDrawnFeatureCollection,
    refreshList,
    showErr,
    showOk,
    t,
  ]);

  /* =========================================================
     Show on map
  ========================================================= */
  const handleShowSelected = useCallback(async () => {
    if (!orgId) {
      showErr(t("geocercas.manage.noOrgTitle", { defaultValue: "Selecciona una organización." }));
      return;
    }

    let nameToShow = lastSelectedName || Array.from(selectedNames)[0] || null;
    if (!nameToShow && geofenceList.length) nameToShow = geofenceList[0].nombre;

    if (!nameToShow) {
      showErr(t("geocercas.errorSelectAtLeastOne", { defaultValue: "Selecciona al menos una geocerca." }));
      return;
    }

    const item = geofenceList.find((g) => g.nombre === nameToShow);
    if (!item?.id) {
      showErr(t("geocercas.errorNoGeojson", { defaultValue: "No se encontró la geocerca en el servidor." }));
      return;
    }

    try {
      const row = await getGeocerca({ id: item.id, orgId });
      const geo = normalizeGeojson(row?.geojson || row?.geometry);
      if (!geo) {
        showErr(t("geocercas.errorNoGeojson", { defaultValue: "No se encontró el GeoJSON de la geocerca." }));
        return;
      }

      setViewFeature(geo);

      if (mapRef.current) {
        try {
          const bounds = L.geoJSON(geo).getBounds();
          if (bounds?.isValid?.()) mapRef.current.fitBounds(bounds, { padding: [40, 40] });
        } catch {}
      }
    } catch (e) {
      showErr(t("geocercas.errorLoad", { defaultValue: "No se pudo cargar la geocerca." }), e);
    }
  }, [orgId, lastSelectedName, selectedNames, geofenceList, showErr, t]);

  /* =========================================================
     Delete selected (soft delete)
  ========================================================= */
  const handleDeleteSelected = useCallback(async () => {
    if (!orgId) {
      showErr(t("geocercas.manage.noOrgTitle", { defaultValue: "Selecciona una organización." }));
      return;
    }
    if (!selectedNames.size) {
      showErr(t("geocercas.errorSelectAtLeastOne", { defaultValue: "Selecciona al menos una geocerca." }));
      return;
    }

    if (!window.confirm(t("geocercas.deleteConfirm", { defaultValue: "¿Eliminar las geocercas seleccionadas?" }))) {
      return;
    }

    const names = Array.from(selectedNames);
    const targets = geofenceList.filter((g) => names.includes(g.nombre));

    try {
      let total = 0;
      for (const g of targets) {
        if (g?.id) {
          const r = await deleteGeocerca({ orgId, id: g.id });
          total += Number(r?.deleted || 0);
        } else {
          // por nombre_ci
          const r = await deleteGeocerca({ orgId, nombre_ci: normalizeNombreCi(g.nombre) });
          total += Number(r?.deleted || 0);
        }
      }

      setSelectedNames(new Set());
      setLastSelectedName(null);
      setViewFeature(null);

      await refreshList();
      showOk(t("geocercas.deletedCount", { count: total, defaultValue: `Eliminadas: ${total}` }));
    } catch (e) {
      await refreshList();
      showErr(t("geocercas.deleteError", { defaultValue: "No se pudo eliminar. Intenta nuevamente." }), e);
    }
  }, [orgId, selectedNames, geofenceList, refreshList, showErr, showOk, t]);

  const pointStyle = useMemo(
    () => ({
      pointToLayer: (_feature, latlng) => L.circleMarker(latlng, { radius: 4, weight: 1 }),
    }),
    []
  );

  return (
    <div className="flex flex-col gap-3 h-[calc(100svh-140px)] lg:h-[calc(100vh-140px)]">
      <Banner banner={banner} onClose={() => setBanner(null)} />

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div className="space-y-0.5">
          <h1 className="text-xl sm:text-2xl font-semibold text-slate-100">
            {t("geocercas.titleNew", { defaultValue: "Nueva geocerca" })}
          </h1>
          <p className="hidden md:block text-xs text-slate-300">
            {t("geocercas.subtitleNew", { defaultValue: "Dibuja una geocerca y guárdala en tu organización." })}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 md:flex md:items-center md:gap-2">
          <input
            type="text"
            className="col-span-2 rounded-lg bg-slate-900 border border-emerald-400/60 text-white font-semibold px-3 py-2 text-xs md:col-span-1 md:px-4 md:py-2.5 md:text-sm"
            placeholder={t("geocercas.placeholderName", { defaultValue: "Nombre de nueva geocerca" })}
            value={geofenceName}
            onChange={(e) => setGeofenceName(e.target.value)}
          />

          <button
            onClick={() => setCoordModalOpen(true)}
            className="rounded-lg font-semibold bg-slate-800 text-slate-50 border border-slate-600 px-3 py-2 text-xs md:px-4 md:py-2.5 md:text-sm whitespace-nowrap"
          >
            {t("geocercas.buttonDrawByCoords", { defaultValue: "Por coordenadas" })}
          </button>

          <button
            onClick={handleSave}
            className="rounded-lg font-semibold bg-emerald-600 text-white px-3 py-2 text-xs md:px-4 md:py-2.5 md:text-sm whitespace-nowrap"
          >
            {t("geocercas.buttonSave", { defaultValue: "Guardar" })}
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col gap-3 lg:grid lg:grid-cols-4">
        {/* Panel */}
        <div className="bg-slate-900/80 rounded-xl border border-slate-700/80 p-3 flex flex-col min-h-0 max-h-[42svh] md:max-h-[32svh] lg:max-h-none">
          <h2 className="text-sm font-semibold text-slate-100 mb-2">
            {t("geocercas.panelTitle", { defaultValue: "Geocercas" })}
          </h2>

          <div className="flex-1 min-h-0 overflow-auto space-y-1 pr-1">
            {loadingList && <div className="text-xs text-slate-400">{t("geocercas.list.loading", { defaultValue: "Cargando..." })}</div>}

            {!loadingList && geofenceList.length === 0 && (
              <div className="text-xs text-slate-400">{t("geocercas.noGeofences", { defaultValue: "No hay geocercas." })}</div>
            )}

            {geofenceList.map((g) => (
              <label key={`${g.id || g.nombre}`} className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-slate-800">
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

          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              onClick={handleShowSelected}
              className="w-full px-2 py-1.5 rounded-md text-[11px] font-semibold bg-sky-600 text-white"
            >
              {t("geocercas.buttonShowOnMap", { defaultValue: "Mostrar en mapa" })}
            </button>

            <button
              onClick={handleDeleteSelected}
              className="w-full px-2 py-1.5 rounded-md text-[11px] font-semibold bg-red-600 text-white"
            >
              {t("geocercas.buttonDeleteSelected", { defaultValue: "Eliminar" })}
            </button>
          </div>
        </div>

        {/* Map */}
        <div className="lg:col-span-3 bg-slate-900/50 border border-slate-700/80 rounded-xl overflow-hidden min-h-[46svh] lg:min-h-0">
          <MapContainer
            center={[-0.1807, -78.4678]}
            zoom={12}
            style={{ height: "100%", width: "100%" }}
            whenCreated={(m) => (mapRef.current = m)}
          >
            <MapInvalidate />
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

            <FeatureGroup ref={fgRef} />

            {viewFeature && <GeoJSON data={viewFeature} {...pointStyle} />}
          </MapContainer>
        </div>
      </div>

      {/* Modal coordenadas */}
      {coordModalOpen && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-3">
          <div className="w-full max-w-lg rounded-2xl border border-slate-600 bg-slate-950 p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold text-slate-100">
                {t("geocercas.modalTitle", { defaultValue: "Dibujar por coordenadas" })}
              </div>
              <button
                className="text-xs px-2 py-1 rounded-md bg-slate-800 text-slate-100"
                onClick={() => setCoordModalOpen(false)}
              >
                {t("common.actions.cancel", { defaultValue: "Cerrar" })}
              </button>
            </div>

            <div className="text-xs text-slate-300 mb-2">
              {t("geocercas.modalInstruction", { defaultValue: "Formato: lat,lng (uno por línea)" })}
            </div>

            <textarea
              className="w-full h-40 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 p-2 text-xs"
              value={coordText}
              onChange={(e) => setCoordText(e.target.value)}
              placeholder={"-0.18,-78.47\n-0.19,-78.48\n-0.17,-78.49"}
            />

            <div className="mt-3 flex gap-2 justify-end">
              <button
                className="px-3 py-2 rounded-lg bg-slate-800 text-slate-100 text-xs font-semibold"
                onClick={() => setCoordModalOpen(false)}
              >
                {t("common.actions.cancel", { defaultValue: "Cancelar" })}
              </button>
              <button
                className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold"
                onClick={() => {
                  // solo cerramos; el guardado usa coordText
                  setCoordModalOpen(false);
                  showOk(t("geocercas.coordsReady", { defaultValue: "Coordenadas listas. Presiona Guardar." }));
                }}
              >
                {t("geocercas.modalDraw", { defaultValue: "Listo" })}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
