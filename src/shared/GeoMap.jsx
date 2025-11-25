// src/shared/GeoMap.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, GeoJSON } from "react-leaflet";
import { useParams } from "react-router-dom";
import "leaflet/dist/leaflet.css";
import { supabase } from "../supabaseClient";

const DEFAULT_CENTER = [-1.8312, -78.1834];

async function tryViewFeature(id) {
  const { data, error, status } = await supabase
    .from("geocercas_feature")
    .select("id,nombre,descripcion,feature")
    .eq("id", id)
    .maybeSingle();
  if (error) throw Object.assign(new Error("view_error"), { cause: error, status });
  return data;
}

async function tryTableCoordenadas(id) {
  const { data, error, status } = await supabase
    .from("geocercas")
    .select("id,nombre,descripcion,coordenadas")
    .eq("id", id)
    .maybeSingle();
  if (error) throw Object.assign(new Error("table_error"), { cause: error, status });
  return data;
}

function toFeatureFromRecord(rec) {
  if (!rec) return null;

  // Caso vista: feature (Feature o Geometry)
  if (rec.feature) {
    const f = rec.feature;
    if (f.type === "Feature" && f.geometry) return f;
    if (f.type && f.coordinates) return { type: "Feature", properties: {}, geometry: f };
  }

  // Caso tabla: coordenadas [[ [lat,lng], ... ], ...]
  if (rec.coordenadas && Array.isArray(rec.coordenadas)) {
    // si hay varios polígonos, uso el primero para simplificar la vista
    const polys = rec.coordenadas;
    if (!polys.length) return null;
    const ring = polys[0];
    if (!Array.isArray(ring) || ring.length < 3) return null;
    const coords = ring.map(([la, ln]) => [ln, la]); // GeoJSON = [lng,lat]
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
  const { id: idFromRoute } = useParams();
  const idFromQuery = useMemo(() => {
    try { return new URLSearchParams(window.location.search).get("id"); } catch { return null; }
  }, []);
  const targetId = geocercaId || idFromRoute || idFromQuery || "43c6f0ea-c5f9-4f51-9fea-2fda5ab1163d";

  const [feature, setFeature] = useState(null);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const mapRef = useRef(null);
  const geoJsonRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setFetchError(null);
      try {
        let rec = null;
        try {
          rec = await tryViewFeature(targetId);        // 1) vista
        } catch (_e) {
          rec = await tryTableCoordenadas(targetId);   // 2) tabla fallback
        }
        const feat = toFeatureFromRecord(rec);
        if (!mounted) return;
        if (!feat) {
          setFeature(null);
          setFetchError("No hay geometría válida (feature/coordenadas).");
          return;
        }
        setFeature(feat);
        setMeta(rec);
      } catch (e) {
        if (!mounted) return;
        console.error("GeoMap fetch error:", e);
        setFetchError("Error al cargar geocerca (ver consola).");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [targetId]);

  useEffect(() => {
    const map = mapRef.current;
    const layer = geoJsonRef.current;
    if (map && layer && layer.getBounds) {
      const b = layer.getBounds();
      if (b?.isValid && b.isValid()) map.fitBounds(b.pad(0.15));
    }
  }, [feature]);

  return (
    <div style={{ width: "100%", height: "100%", minHeight: "90vh" }}>
      {loading && <div style={{ padding: 8 }}>Cargando geocerca…</div>}
      {!loading && fetchError && <div style={{ padding: 8, color: "#b91c1c" }}>{fetchError}</div>}
      {!loading && !fetchError && meta && (
        <div style={{ padding: "6px 10px", background: "#f0f9ff", borderBottom: "1px solid #bae6fd", fontWeight: 600 }}>
          {meta?.nombre || "Geocerca"}
          <span style={{ color: "#475569", fontWeight: 400, marginLeft: 8 }}>
            {meta?.descripcion || ""}
          </span>
        </div>
      )}

      <MapContainer
        center={DEFAULT_CENTER}
        zoom={6}
        style={{ width: "100%", height: "100%", minHeight: 480 }}
        whenCreated={(m) => (mapRef.current = m)}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
        {feature && <GeoJSON ref={geoJsonRef} data={feature} style={{ color: "#2563eb", weight: 2, fillOpacity: 0.25 }} />}
      </MapContainer>
    </div>
  );
}
