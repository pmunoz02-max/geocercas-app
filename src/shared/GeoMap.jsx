import React, { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, GeoJSON } from "react-leaflet";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import "leaflet/dist/leaflet.css";
import { supabase } from "../supabaseClient";

const DEFAULT_CENTER = [-1.8312, -78.1834];

async function tryViewFeature(id) {
  const { data, error, status } = await supabase
    .from("geocercas_feature")
    .select("id,nombre,descripcion,feature")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw Object.assign(new Error("view_error"), { cause: error, status });
  }

  return data;
}

async function tryTableCoordenadas(id) {
  const { data, error, status } = await supabase
    .from("geocercas")
    .select("id,nombre,descripcion,coordenadas")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw Object.assign(new Error("table_error"), { cause: error, status });
  }

  return data;
}

function toFeatureFromRecord(rec) {
  if (!rec) return null;

  if (rec.feature) {
    const f = rec.feature;
    if (f.type === "Feature" && f.geometry) return f;
    if (f.type && f.coordinates) {
      return { type: "Feature", properties: {}, geometry: f };
    }
  }

  if (rec.coordenadas && Array.isArray(rec.coordenadas)) {
    const polys = rec.coordenadas;
    if (!polys.length) return null;

    const ring = polys[0];
    if (!Array.isArray(ring) || ring.length < 3) return null;

    const coords = ring.map(([la, ln]) => [ln, la]);
    const closed =
      coords.length >= 3 &&
      (coords[0][0] !== coords[coords.length - 1][0] ||
        coords[0][1] !== coords[coords.length - 1][1])
        ? [...coords, coords[0]]
        : coords;

    return {
      type: "Feature",
      properties: { nombre: rec.nombre, descripcion: rec.descripcion },
      geometry: { type: "Polygon", coordinates: [closed] },
    };
  }

  return null;
}

export default function GeoMap({ geocercaId }) {
  const { t } = useTranslation();
  const tr = (key, fallback, options = {}) => t(key, { defaultValue: fallback, ...options });

  const { id: idFromRoute } = useParams();
  const idFromQuery = useMemo(() => {
    try {
      return new URLSearchParams(window.location.search).get("id");
    } catch {
      return null;
    }
  }, []);

  const targetId = geocercaId || idFromRoute || idFromQuery || null;

  const [feature, setFeature] = useState(null);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const mapRef = useRef(null);
  const geoJsonRef = useRef(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      setLoading(true);
      setFetchError("");
      setFeature(null);
      setMeta(null);

      if (!targetId) {
        if (mounted) {
          setFetchError(tr("geocercas.errorLoad", "No se pudo cargar la geocerca."));
          setLoading(false);
        }
        return;
      }

      try {
        let rec = null;

        try {
          rec = await tryViewFeature(targetId);
        } catch {
          rec = await tryTableCoordenadas(targetId);
        }

        const feat = toFeatureFromRecord(rec);
        if (!mounted) return;

        if (!feat) {
          setFeature(null);
          setFetchError(
            tr("sharedGeoMap.errors.invalidGeometry", "No valid geometry was found for this geofence.")
          );
          return;
        }

        setFeature(feat);
        setMeta(rec);
      } catch (e) {
        if (!mounted) return;
        console.error("[GeoMap] fetch error:", e);
        setFetchError(
          tr("sharedGeoMap.errors.load", "Could not load the geofence.")
        );
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [targetId, t]);

  useEffect(() => {
    const map = mapRef.current;
    const layer = geoJsonRef.current;

    if (map && layer && typeof layer.getBounds === "function") {
      const bounds = layer.getBounds();
      if (bounds?.isValid?.()) {
        map.fitBounds(bounds.pad(0.15));
      }
    }
  }, [feature]);

  return (
    <div style={{ width: "100%", height: "100%", minHeight: "90vh" }}>
      {loading && (
        <div style={{ padding: 8 }}>
          {tr("common.actions.loading", "Loading…")}
        </div>
      )}

      {!loading && fetchError && (
        <div style={{ padding: 8, color: "#b91c1c" }}>{fetchError}</div>
      )}

      {!loading && !fetchError && meta && (
        <div
          style={{
            padding: "6px 10px",
            background: "#f0f9ff",
            borderBottom: "1px solid #bae6fd",
            fontWeight: 600,
          }}
        >
          {meta?.nombre || tr("tracker.legend.geofence", "Geofence")}
          <span style={{ color: "#475569", fontWeight: 400, marginLeft: 8 }}>
            {meta?.descripcion || ""}
          </span>
        </div>
      )}

      <MapContainer
        center={DEFAULT_CENTER}
        zoom={6}
        style={{ width: "100%", height: "100%", minHeight: 480 }}
        whenCreated={(mapInstance) => {
          mapRef.current = mapInstance;
        }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />
        {feature ? (
          <GeoJSON
            ref={geoJsonRef}
            data={feature}
            style={{ color: "#2563eb", weight: 2, fillOpacity: 0.25 }}
          />
        ) : null}
      </MapContainer>
    </div>
  );
}
