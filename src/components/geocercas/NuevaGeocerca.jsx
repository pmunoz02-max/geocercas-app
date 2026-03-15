import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, FeatureGroup, Pane, useMapEvents } from "react-leaflet";
import L from "leaflet";

import "leaflet/dist/leaflet.css";
import { GeomanControls } from "react-leaflet-geoman-v2";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";

import { useAuthSafe } from "@/auth/AuthProvider.jsx";
import { useTranslation } from "react-i18next";

import { supabase } from "@/lib/supabaseClient.js";
import useOrgEntitlements from "@/hooks/useOrgEntitlements.js";
import UpgradeToProButton from "@/components/Billing/UpgradeToProButton.jsx";

import { listGeofences, getGeofence, upsertGeofence, deleteGeofence } from "../../lib/geofencesApi.js";

const DATA_SOURCE = null;
const GEOJSON_URL = "/data/mapa_corto_214.geojson";
const CSV_URL = "/data/mapa_corto_214.csv";

function Banner({ banner, onClose }) {
  const { t } = useTranslation();
  if (!banner) return null;

  const klass =
    banner.type === "error"
      ? "bg-red-950/90 border-red-500/50 text-red-100"
      : banner.type === "ok"
      ? "bg-emerald-950/90 border-emerald-500/50 text-emerald-100"
      : banner.type === "warn"
      ? "bg-amber-950/90 border-amber-500/50 text-amber-100"
      : "bg-slate-950/90 border-slate-500/50 text-slate-100";

  return (
    <div className={`rounded-xl border px-3 py-2 text-sm flex items-start justify-between gap-3 shadow-xl backdrop-blur ${klass}`}>
      <div className="leading-snug">{banner.text}</div>
      <button
        className="pointer-events-auto px-2 py-1 rounded-md bg-black/20 hover:bg-black/30 text-xs font-semibold"
        onClick={onClose}
        type="button"
      >
        {t("common.actions.close", { defaultValue: "Close" })}
      </button>
    </div>
  );
}

function StatBadge({ label, value, tone = "default" }) {
  const toneClass =
    tone === "accent"
      ? "border-emerald-400/40 bg-emerald-950/80 text-emerald-50"
      : tone === "warn"
      ? "border-amber-400/40 bg-amber-950/80 text-amber-50"
      : "border-slate-300/20 bg-slate-950/80 text-slate-50";

  return (
    <div className={`min-w-[120px] rounded-2xl border px-3 py-2 shadow-lg backdrop-blur-md ${toneClass}`}>
      <div className="text-[10px] uppercase tracking-[0.14em] text-slate-300/80">{label}</div>
      <div className="mt-1 text-sm sm:text-base font-semibold">{value}</div>
    </div>
  );
}

function CursorPosLive({ setCursorLatLng }) {
  useMapEvents({
    mousemove: (e) => setCursorLatLng(e.latlng),
    mouseout: () => setCursorLatLng(null),
  });
  return null;
}

function ensureFeatureCollection(input) {
  if (!input) return null;
  if (input.type === "FeatureCollection") return input;
  if (input.type === "Feature") return { type: "FeatureCollection", features: [input] };
  if (input.type && input.coordinates) {
    return {
      type: "FeatureCollection",
      features: [{ type: "Feature", properties: {}, geometry: input }],
    };
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
    return {
      type: "FeatureCollection",
      features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [c.lng, c.lat] } }],
    };
  } catch {
    return null;
  }
}

function centerFromBbox(bbox) {
  if (!Array.isArray(bbox) || bbox.length < 4) return null;
  const [minLng, minLat, maxLng, maxLat] = bbox.map(Number);
  if (![minLng, minLat, maxLng, maxLat].every(Number.isFinite)) return null;
  return {
    lat: (minLat + maxLat) / 2,
    lng: (minLng + maxLng) / 2,
  };
}

function centerFromAnyGeo(input) {
  try {
    const fc = ensureFeatureCollection(input);
    if (!fc) return null;
    const layer = L.geoJSON(fc);
    const bounds = layer.getBounds();
    if (!bounds?.isValid?.()) return null;
    const c = bounds.getCenter();
    if (!Number.isFinite(c.lat) || !Number.isFinite(c.lng)) return null;
    return { lat: c.lat, lng: c.lng };
  } catch {
    return null;
  }
}

function getGeofenceCenter(row) {
  const lat = Number(row?.lat);
  const lng = Number(row?.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat, lng };
  }

  const fromBbox = centerFromBbox(row?.bbox);
  if (fromBbox) return fromBbox;

  const fromGeo =
    centerFromAnyGeo(row?.geojson) ||
    centerFromAnyGeo(row?.polygon_geojson) ||
    centerFromAnyGeo(row?.geom);

  if (fromGeo) return fromGeo;

  return null;
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
    out.push([lng, lat]);
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

function normalizePlanLabel(planCode) {
  const v = String(planCode || "free").toLowerCase();
  if (v === "pro") return "PRO";
  if (v === "enterprise") return "ENTERPRISE";
  if (v === "elite_plus") return "ELITE PLUS";
  return v.toUpperCase();
}

function extractErrorText(err) {
  const parts = [
    err?.message,
    err?.details,
    err?.hint,
    err?.error_description,
    err?.response?.data?.message,
    err?.response?.data?.error,
  ]
    .filter(Boolean)
    .map((x) => String(x).trim());

  return parts.join(" | ");
}

function isPlanLimitError(err) {
  const text = extractErrorText(err).toLowerCase();
  return (
    text.includes("limit_exceeded") ||
    text.includes("plan limit") ||
    text.includes("límite") ||
    text.includes("max_geocercas") ||
    text.includes("geofence limit") ||
    text.includes("excede") ||
    text.includes("p0001")
  );
}

export default function NuevaGeocerca() {
  const { t } = useTranslation();
  const { currentOrg } = useAuthSafe();

  const {
    loading: entitlementsLoading,
    error: entitlementsError,
    planCode,
    maxGeocercas,
    isFree,
    isPro,
    isEnterprise,
    isElite,
    isElitePlus,
    isStarter,
    refresh: refreshEntitlements,
  } = useOrgEntitlements();

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
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [statsVisible, setStatsVisible] = useState(true);

  async function getAccessToken() {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || null;
  }

  const showErr = useCallback((msg, err) => {
    try {
      console.error("[NuevaGeocerca]", msg, err);
    } catch {}
    setBanner({ type: "error", text: String(msg || "Error") });
  }, []);

  const showOk = useCallback((msg) => {
    setBanner({ type: "ok", text: String(msg || "OK") });
  }, []);

  const showWarn = useCallback((msg) => {
    setBanner({ type: "warn", text: String(msg || "Warning") });
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
    if (!orgId) {
      setGeofenceList([]);
      return;
    }

    const { data, error } = await supabase
      .from("geofences")
      .select("id, org_id, name, geojson, polygon_geojson, geom, bbox, lat, lng, radius_m, active, is_default, created_at, updated_at")
      .eq("org_id", orgId)
      .eq("active", true)
      .order("is_default", { ascending: false })
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[refreshGeofenceList] supabase error:", error);
      setGeofenceList([]);
      return;
    }

    const normalized = (data || [])
      .map((x) => {
        const center = getGeofenceCenter(x);
        return {
          ...x,
          name: String(x?.name ?? "").trim(),
          centerLat: center?.lat ?? null,
          centerLng: center?.lng ?? null,
        };
      })
      .filter((x) => x.name);

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

  const fitGeoNow = useCallback((geo) => {
    const map = mapRef.current;
    if (!map || !geo) return false;

    try {
      const fc = ensureFeatureCollection(geo);
      if (!fc) return false;

      const layer = L.geoJSON(fc);
      const bounds = layer.getBounds();
      if (!bounds?.isValid?.()) return false;

      try {
        map.invalidateSize?.(true);
      } catch {}

      const southWest = bounds.getSouthWest();
      const northEast = bounds.getNorthEast();
      const samePoint = southWest.lat === northEast.lat && southWest.lng === northEast.lng;

      if (samePoint) {
        map.setView(bounds.getCenter(), 17, { animate: true });
      } else {
        map.fitBounds(bounds, {
          padding: [80, 80],
          maxZoom: 17,
          animate: true,
        });
      }

      return true;
    } catch (err) {
      try {
        console.error("[NuevaGeocerca] fitGeoNow error", err);
      } catch {}
      return false;
    }
  }, []);

  const scheduleFitToGeo = useCallback(
    (geo) => {
      if (!geo) return;

      const run = () => {
        fitGeoNow(geo);
      };

      try {
        requestAnimationFrame(() => {
          run();
          setTimeout(run, 80);
          setTimeout(run, 220);
          setTimeout(run, 450);
        });
      } catch {
        run();
        setTimeout(run, 80);
        setTimeout(run, 220);
        setTimeout(run, 450);
      }
    },
    [fitGeoNow]
  );

  useEffect(() => {
    if (!viewFeature) return;
    scheduleFitToGeo(viewFeature);
  }, [viewId, viewFeature, scheduleFitToGeo]);

  const currentGeofenceCount = useMemo(() => {
    return Array.isArray(geofenceList) ? geofenceList.filter((x) => !x?._optimistic).length : 0;
  }, [geofenceList]);

  const hasFiniteGeofenceLimit = useMemo(() => {
    return Number.isFinite(Number(maxGeocercas)) && Number(maxGeocercas) > 0;
  }, [maxGeocercas]);

  const geofenceSlotsLeft = useMemo(() => {
    if (!hasFiniteGeofenceLimit) return null;
    return Math.max(Number(maxGeocercas) - currentGeofenceCount, 0);
  }, [hasFiniteGeofenceLimit, maxGeocercas, currentGeofenceCount]);

  const geofenceLimitReached = useMemo(() => {
    if (!hasFiniteGeofenceLimit) return false;
    return currentGeofenceCount >= Number(maxGeocercas);
  }, [hasFiniteGeofenceLimit, currentGeofenceCount, maxGeocercas]);

  const canCreateGeofence = useMemo(() => {
    if (!hasFiniteGeofenceLimit) return true;
    return currentGeofenceCount < Number(maxGeocercas);
  }, [hasFiniteGeofenceLimit, currentGeofenceCount, maxGeocercas]);

  const planTone = useMemo(() => {
    if (geofenceLimitReached) return "warn";
    if (isPro || isEnterprise || isElite || isElitePlus) return "accent";
    return "default";
  }, [geofenceLimitReached, isPro, isEnterprise, isElite, isElitePlus]);

  const planSummaryText = useMemo(() => {
    if (entitlementsLoading) {
      return t("geocercas.plan.loading", { defaultValue: "Loading plan..." });
    }

    if (entitlementsError) {
      return t("geocercas.plan.error", { defaultValue: "The plan limits could not be loaded." });
    }

    if (!hasFiniteGeofenceLimit) {
      return t("geocercas.plan.unlimited", { defaultValue: "Geofences without a configured limit." });
    }

    return t("geocercas.plan.usage", {
      defaultValue: "Current usage: {{used}} / {{max}} geofences",
      used: currentGeofenceCount,
      max: Number(maxGeocercas),
    });
  }, [entitlementsLoading, entitlementsError, hasFiniteGeofenceLimit, currentGeofenceCount, maxGeocercas, t]);

  const handleDrawFromCoords = useCallback(() => {
    const pairs = parsePairs(coordText);
    if (!pairs.length) {
      showErr(
        t("geocercas.errorCoordsInvalid", {
          defaultValue: "Invalid coordinates. Use format: lat,lng (one per line).",
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
    showOk(t("geocercas.coordsReady", { defaultValue: "Shape created from coordinates." }));
  }, [coordText, clearCanvas, t, showErr, showOk, scheduleFitToGeo]);

  const handleSave = useCallback(async () => {
    try {
      const nm = String(geofenceName || "").trim();
      if (!nm) {
        showErr(t("geocercas.errorNameRequired", { defaultValue: "Please enter a name for the geofence." }));
        return;
      }

      const orgId = currentOrg?.id || null;
      if (!orgId) {
        showErr(t("geocercas.manage.noOrgTitle", { defaultValue: "Org not available." }));
        return;
      }

      if (hasFiniteGeofenceLimit && !canCreateGeofence) {
        showWarn(
          t("geocercas.plan.limitReached", {
            defaultValue: "You have reached the geofence limit of your current plan. Upgrade to PRO to continue.",
          })
        );
        return;
      }

      let fc = null;

      if (draftFeature) {
        fc = { type: "FeatureCollection", features: [draftFeature] };
      } else {
        const map = mapRef.current;
        const layerToSave = selectedLayerRef.current || lastCreatedLayerRef.current || getLastGeomanLayer(map);

        if (!layerToSave || typeof layerToSave.toGeoJSON !== "function") {
          showErr(
            t("geocercas.errorNoShape", {
              defaultValue: "Draw a geofence on the map or create one by coordinates before saving.",
            })
          );
          return;
        }

        fc = { type: "FeatureCollection", features: [layerToSave.toGeoJSON()] };
      }

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

      await upsertGeofence({
        name: nm,
        polygon_geojson: fc,
        geojson: fc,
        radius_m: 0,
      });

      clearCanvas();
      setDraftFeature(null);

      setViewFeature(fc);
      setViewCentroid(centroidFeatureFromGeojson(fc));
      setViewId((x) => x + 1);

      await Promise.allSettled([refreshGeofenceList(), refreshEntitlements()]);
      setGeofenceName("");
      showOk(t("geocercas.savedOk", { defaultValue: "Geofence saved successfully." }));

      scheduleFitToGeo(fc);
    } catch (e) {
      const isLimit = isPlanLimitError(e);

      if (isLimit) {
        showWarn(
          t("geocercas.plan.limitReached", {
            defaultValue: "You have reached the geofence limit of your current plan. Upgrade to PRO to continue.",
          })
        );
      } else {
        showErr(
          t("geocercas.errorSave", { defaultValue: "Could not save the geofence. Please try again." }),
          e
        );
      }

      try {
        await Promise.allSettled([refreshGeofenceList(), refreshEntitlements()]);
      } catch {}
    }
  }, [
    geofenceName,
    currentOrg?.id,
    draftFeature,
    t,
    refreshGeofenceList,
    refreshEntitlements,
    showErr,
    showOk,
    showWarn,
    clearCanvas,
    hasFiniteGeofenceLimit,
    canCreateGeofence,
    scheduleFitToGeo,
  ]);

  const handleDeleteSelected = useCallback(async () => {
    if (!selectedNames || selectedNames.size === 0) {
      showErr(t("geocercas.errorSelectAtLeastOne", { defaultValue: "Select at least one geofence." }));
      return;
    }

    const confirmed = window.confirm(
      t("geocercas.deleteConfirm", { defaultValue: "Delete the selected geofences?" })
    );
    if (!confirmed) return;

    const orgId = currentOrg?.id || null;
    const names = Array.from(selectedNames).map((x) => String(x || "").trim()).filter(Boolean);

    try {
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

      await Promise.allSettled([refreshGeofenceList(), refreshEntitlements()]);
      clearCanvas();
      setDraftFeature(null);

      showOk(t("geocercas.deletedCount", { count: names.length, defaultValue: `Deleted: ${names.length}` }));
    } catch (e) {
      showErr(t("geocercas.deleteError", { defaultValue: "Could not delete. Please try again." }), e);
    }
  }, [selectedNames, currentOrg?.id, refreshGeofenceList, refreshEntitlements, clearCanvas, t, showErr, showOk, geofenceList]);

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
          showErr(t("geocercas.errorSelectAtLeastOne", { defaultValue: "Select at least one geofence." }));
          return;
        }
        namesToShow = [one];
      }

      const items = namesToShow
        .map((nm) => geofenceList.find((g) => String(g.name) === nm))
        .filter(Boolean);

      if (!items.length) return;

      const geos = [];
      for (const item of items) {
        if (!orgId || !item.id || String(item.id).startsWith("optim-")) continue;

        const row = await getGeofence({ id: item.id, orgId });
        const geo = normalizeGeojson(row?.polygon_geojson || row?.geojson || row?.geometry);

        if (geo) geos.push(geo);
      }

      const combined = combineFeatureCollections(geos);
      if (!combined) {
        showErr(t("geocercas.errorNoGeojson", { defaultValue: "Could not load the geofence GeoJSON." }));
        return;
      }

      clearCanvas();
      setDraftFeature(null);

      setViewFeature(combined);
      setViewCentroid(centroidFeatureFromGeojson(combined));
      setViewId((x) => x + 1);

      const zoomed = fitGeoNow(combined);
      if (!zoomed) {
        scheduleFitToGeo(combined);
      } else {
        setTimeout(() => scheduleFitToGeo(combined), 120);
      }

      if (items.length > 1) {
        showOk(
          t("geocercas.showManyOk", {
            count: items.length,
            defaultValue: `Showing ${items.length} geofences.`,
          })
        );
      } else {
        showOk(
          t("geocercas.showOneOk", {
            defaultValue: "Showing selected geofence on map.",
          })
        );
      }
    } catch (e) {
      showErr(t("geocercas.errorLoad", { defaultValue: "Could not load the geofence." }), e);
    } finally {
      setShowLoading(false);
    }
  }, [
    selectedNames,
    lastSelectedName,
    geofenceList,
    currentOrg?.id,
    t,
    showErr,
    showOk,
    clearCanvas,
    fitGeoNow,
    scheduleFitToGeo,
  ]);

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

  const geofencePanel = (
    <div className="rounded-2xl border border-white/15 bg-slate-950/82 text-slate-50 shadow-2xl backdrop-blur-md">
      <div className="flex items-start justify-between gap-3 p-3 sm:p-4">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-semibold leading-tight">
            {t("geocercas.titleNew", { defaultValue: "New geofence" })}
          </h1>
          <p className="mt-1 text-[11px] sm:text-xs text-slate-300">
            {t("geocercas.subtitleNew", {
              defaultValue: "Draw a geofence on the map and save it to your organization.",
            })}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setPanelCollapsed((v) => !v)}
          className="hidden md:inline-flex pointer-events-auto rounded-lg border border-slate-700 bg-slate-900/90 px-2.5 py-1.5 text-[11px] font-semibold text-slate-200 hover:bg-slate-800"
        >
          {panelCollapsed
            ? t("common.actions.show", { defaultValue: "Show" })
            : t("common.actions.hide", { defaultValue: "Hide" })}
        </button>
      </div>

      {!panelCollapsed && (
        <div className="space-y-3 border-t border-white/10 px-3 pb-3 pt-3 sm:px-4 sm:pb-4">
          <div className="space-y-2">
            <input
              type="text"
              className="pointer-events-auto w-full rounded-xl border border-emerald-400/60 bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              placeholder={t("geocercas.placeholderName", { defaultValue: "Geofence name" })}
              value={geofenceName}
              onChange={(e) => setGeofenceName(e.target.value)}
            />

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                onClick={() => {
                  setCoordText("");
                  setCoordModalOpen(true);
                }}
                className="pointer-events-auto rounded-xl border border-slate-600 bg-slate-800 px-3 py-2.5 text-sm font-semibold text-slate-50 hover:bg-slate-700"
                type="button"
              >
                {t("geocercas.buttonDrawByCoords", { defaultValue: "Draw by coordinates" })}
              </button>

              <button
                onClick={handleSave}
                disabled={entitlementsLoading || !canCreateGeofence}
                className={`pointer-events-auto rounded-xl px-3 py-2.5 text-sm font-semibold ${
                  entitlementsLoading || !canCreateGeofence
                    ? "cursor-not-allowed bg-slate-700 text-slate-300"
                    : "bg-emerald-600 text-white hover:bg-emerald-500"
                }`}
                type="button"
              >
                {t("geocercas.buttonSave", { defaultValue: "Save geofence" })}
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="text-[11px] uppercase tracking-[0.14em] text-slate-400">
              {t("pricing.common.currentPlan", { defaultValue: "Current plan" })}
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-sm font-semibold">{normalizePlanLabel(planCode)}</span>
              {geofenceLimitReached ? (
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-200">
                  {t("geocercas.plan.limitReachedShort", { defaultValue: "Limit reached" })}
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-xs text-slate-300">{planSummaryText}</p>

            {entitlementsError ? (
              <p className="mt-2 text-xs text-red-300">{entitlementsError}</p>
            ) : null}

            {!entitlementsLoading && geofenceLimitReached ? (
              <div className="mt-3 space-y-3 rounded-xl border border-amber-500/30 bg-amber-950/30 p-3">
                <div className="text-sm font-semibold text-amber-200">
                  {t("geocercas.plan.limitReachedTitle", {
                    defaultValue: "You have reached the geofence limit of your plan.",
                  })}
                </div>
                <div className="text-xs text-amber-100">
                  {t("geocercas.plan.limitReachedBody", {
                    defaultValue: "To create more geofences, upgrade your organization to PRO.",
                  })}
                </div>

                {currentOrg?.id ? (
                  <div className="pt-1">
                    <UpgradeToProButton orgId={currentOrg.id} getAccessToken={getAccessToken} />
                  </div>
                ) : null}
              </div>
            ) : null}

            {!entitlementsLoading && !geofenceLimitReached && isFree ? (
              <div className="mt-2 text-xs text-slate-400">
                {t("geocercas.plan.freeHint", {
                  defaultValue: "FREE plan active. When you reach the limit, you can upgrade to PRO from here.",
                })}
              </div>
            ) : null}

            {!entitlementsLoading && (isStarter || isPro || isEnterprise || isElite || isElitePlus) ? (
              <div className="mt-2 text-xs text-slate-400">
                {t("geocercas.plan.activePaidHint", {
                  defaultValue: "Your organization has a plan with higher capacity enabled.",
                })}
              </div>
            ) : null}
          </div>

          {loadingDataset ? (
            <div className="text-[11px] text-slate-400">
              {t("geocercas.loadingDataset", { defaultValue: "Loading dataset..." })}
            </div>
          ) : null}

          {datasetError ? <div className="text-[11px] text-red-300">{datasetError}</div> : null}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="block md:hidden">
        <details className="rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl" open={false}>
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-100">
            {t("geocercas.titleNew", { defaultValue: "New geofence" })}
          </summary>
          <div className="border-t border-white/10 p-3">{geofencePanel}</div>
        </details>
      </div>

      <div className="relative h-[calc(100svh-110px)] min-h-[620px] overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">
        <style>{`
          @media (max-width: 767px) {
            .leaflet-top.leaflet-right {
              top: 140px !important;
            }
          }
        `}</style>

        <div className="absolute inset-0 z-0">
          <MapContainer
            center={[-0.2, -78.5]}
            zoom={8}
            scrollWheelZoom={true}
            style={{ height: "100%", width: "100%" }}
            whenReady={(e) => {
              mapRef.current = e.target;
              try {
                e.target.invalidateSize?.();
              } catch {}
            }}
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
                  position: "topright",
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
        </div>

        <div className="pointer-events-none absolute inset-0 z-[500] bg-gradient-to-b from-slate-950/25 via-transparent to-slate-950/20" />

        <div className="pointer-events-none absolute top-3 left-1/2 z-[1200] w-[min(920px,calc(100%-24px))] -translate-x-1/2">
          <Banner banner={banner} onClose={() => setBanner(null)} />
        </div>

        <div className="hidden md:block absolute top-3 left-3 z-[1100] w-[380px] max-w-[92vw]">
          {geofencePanel}
        </div>

        <div className="absolute left-1/2 top-16 sm:top-20 z-[1100] -translate-x-1/2 flex flex-col items-center gap-2">
          <button
            onClick={() => setStatsVisible((v) => !v)}
            className="pointer-events-auto px-3 py-1 rounded-lg bg-slate-900/80 border border-slate-700 text-xs text-slate-200 hover:bg-slate-800 backdrop-blur-md shadow"
            type="button"
          >
            {statsVisible
              ? t("common.actions.hide", { defaultValue: "Hide" })
              : t("common.actions.show", { defaultValue: "Show" })}
          </button>

          {statsVisible && (
            <div className="flex w-[min(760px,calc(100%-24px))] flex-wrap justify-center gap-2 px-2">
              <StatBadge
                label={t("pricing.common.currentPlan", { defaultValue: "Current plan" })}
                value={normalizePlanLabel(planCode)}
                tone={planTone}
              />
              <StatBadge
                label={t("geocercas.planUsageTitle", { defaultValue: "Geofences" })}
                value={
                  entitlementsLoading
                    ? t("common.actions.loading", { defaultValue: "Loading..." })
                    : hasFiniteGeofenceLimit
                    ? `${currentGeofenceCount} / ${Number(maxGeocercas)}`
                    : t("geocercas.plan.unlimitedShort", { defaultValue: "Unlimited" })
                }
                tone={planTone}
              />
              <StatBadge
                label={t("geocercas.planAvailableTitle", { defaultValue: "Available" })}
                value={
                  entitlementsLoading
                    ? t("common.actions.loading", { defaultValue: "Loading..." })
                    : geofenceSlotsLeft === null
                    ? t("geocercas.plan.unlimitedShort", { defaultValue: "Unlimited" })
                    : String(geofenceSlotsLeft)
                }
                tone={geofenceLimitReached ? "warn" : "default"}
              />
            </div>
          )}
        </div>

        <div className="hidden md:block absolute right-3 bottom-24 z-[1100] space-y-2">
          <div className="rounded-xl bg-slate-950/82 px-3 py-2 text-[11px] text-slate-50 shadow-lg backdrop-blur-md">
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
              <span>{t("geocercas.cursorHint", { defaultValue: "Move the mouse over the map" })}</span>
            )}
          </div>

          <div className="rounded-xl bg-slate-950/82 px-3 py-2 text-[11px] text-slate-50 shadow-lg backdrop-blur-md">
            {t("geocercas.draftLabel", { defaultValue: "Draft" })}:{" "}
            {draftFeature ? t("geocercas.draftYes", { defaultValue: "yes" }) : t("geocercas.draftNo", { defaultValue: "no" })}{" "}
            | {t("geocercas.pointsLabel", { defaultValue: "Pts" })}: {draftPointsCount}
          </div>
        </div>

        <div
          className={`absolute inset-x-0 bottom-0 z-[1100] transition-transform duration-300 ${
            drawerOpen ? "translate-y-0" : "translate-y-[calc(100%-56px)]"
          }`}
        >
          <div className="mx-0 rounded-t-3xl border-t border-white/10 bg-slate-950/90 shadow-2xl backdrop-blur-md">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-slate-100">
                  {t("geocercas.panelTitle", { defaultValue: "Geofences" })}
                </h2>
                <p className="text-[11px] text-slate-400">
                  {t("geocercas.drawerHint", {
                    defaultValue: "Select, show or delete geofences without taking the map off screen.",
                  })}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setDrawerOpen((v) => !v)}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800"
              >
                {drawerOpen
                  ? t("common.actions.hide", { defaultValue: "Hide" })
                  : t("common.actions.show", { defaultValue: "Show" })}
              </button>
            </div>

            <div className="border-t border-white/10 px-4 py-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <button
                  onClick={handleShowSelected}
                  className="rounded-xl bg-sky-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-sky-500"
                  type="button"
                >
                  {showLoading
                    ? t("common.actions.loading", { defaultValue: "Loading..." })
                    : t("geocercas.buttonShowOnMap", { defaultValue: "Show on map" })}
                </button>

                <button
                  onClick={handleDeleteSelected}
                  className="rounded-xl bg-red-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-red-500"
                  type="button"
                >
                  {t("geocercas.buttonDeleteSelected", { defaultValue: "Delete selected" })}
                </button>

                <button
                  onClick={handleClearMap}
                  className="rounded-xl bg-slate-800 px-3 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-700"
                  type="button"
                >
                  {t("geocercas.buttonClearCanvas", { defaultValue: "Clear map" })}
                </button>
              </div>

              <div className="mt-3 max-h-[24svh] overflow-auto pr-1 sm:max-h-[26svh]">
                {geofenceList.length === 0 ? (
                  <div className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-3 text-sm text-slate-400">
                    {t("geocercas.noGeofences", { defaultValue: "You don’t have any geofences yet." })}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {geofenceList.map((g) => (
                      <label
                        key={`api-${g.id || ""}-${g.name}`}
                        className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition ${
                          selectedNames.has(g.name)
                            ? "border-sky-500/50 bg-sky-950/30"
                            : "border-slate-800 bg-slate-900/70 hover:bg-slate-800/80"
                        }`}
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
                        <div className="min-w-0">
                          <div className="truncate text-sm text-slate-100">{g.name}</div>
                          {Number.isFinite(g.centerLat) && Number.isFinite(g.centerLng) ? (
                            <div className="truncate text-xs text-slate-400">
                              Lat: {g.centerLat.toFixed(6)} | Lng: {g.centerLng.toFixed(6)}
                            </div>
                          ) : null}
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {coordModalOpen && (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 p-4">
            <div className="z-[10001] w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-2xl">
              <h2 className="mb-1 text-sm font-semibold text-slate-100">
                {t("geocercas.modalTitle", { defaultValue: "Draw by coordinates" })}
              </h2>

              <p className="text-xs text-slate-400">
                {t("geocercas.modalHintRule", {
                  defaultValue: "1 point = small square | 2 points = rectangle | 3+ = polygon",
                })}
                <br />
                {t("geocercas.modalInstruction", { defaultValue: "Format:" })}{" "}
                <span className="font-mono text-[11px]">lat,lng</span>{" "}
                {t("geocercas.modalOnePerLine", { defaultValue: "(one per line)" })}
              </p>

              <textarea
                rows={6}
                className="mt-3 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
                value={coordText}
                onChange={(e) => setCoordText(e.target.value)}
                placeholder={`-0.180653, -78.467838\n-0.181200, -78.466500\n-0.182000, -78.468200`}
              />

              <div className="mt-3 flex justify-end gap-2">
                <button
                  onClick={() => setCoordModalOpen(false)}
                  className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-medium text-slate-200"
                  type="button"
                >
                  {t("common.actions.cancel", { defaultValue: "Cancel" })}
                </button>

                <button
                  onClick={handleDrawFromCoords}
                  className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white"
                  type="button"
                >
                  {t("geocercas.modalDraw", { defaultValue: "Draw" })}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}