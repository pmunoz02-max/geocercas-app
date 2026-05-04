import React from "react";
import { useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getGeofence } from "../lib/geofencesApi";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import iconUrl from "leaflet/dist/images/marker-icon.png";
import icon2xUrl from "leaflet/dist/images/marker-icon-2x.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl: icon2xUrl, shadowUrl });

function FitBounds({ geojson }) {
  const map = useMap();

  React.useEffect(() => {
    try {
      const layer = L.geoJSON(geojson);
      const bounds = layer.getBounds?.();
      if (bounds?.isValid?.()) {
        map.fitBounds(bounds.pad(0.2));
      }
    } catch {}
  }, [geojson, map]);

  return null;
}

export default function VerGeocerca() {
  const { id } = useParams();
  const { t } = useTranslation();

  const tr = React.useCallback(
    (key, fallback, options = {}) => {
      try {
        const value = t(key, { defaultValue: fallback, ...options });
        if (typeof value !== "string") return fallback;
        const normalized = value.trim();
        if (!normalized || normalized === key) return fallback;
        return value;
      } catch {
        return fallback;
      }
    },
    [t]
  );

  const [item, setItem] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [errorMsg, setErrorMsg] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setErrorMsg("");
      try {
        const data = await getGeofence({ id });
        if (cancelled) return;
        setLoading(false);
        setItem(data || null);
        if (!data) {
          setErrorMsg(tr("geocercas.errorLoad", "No se pudo cargar la geocerca."));
        }
      } catch {
        if (cancelled) return;
        setLoading(false);
        setItem(null);
        setErrorMsg(tr("geocercas.errorLoad", "No se pudo cargar la geocerca."));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, tr]);

  if (loading) {
    return (
      <div className="p-4 text-sm text-slate-700">
        {tr("common.actions.loading", "Cargando…")}
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="p-4 space-y-3">
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {errorMsg}
        </div>
        <Link to="/geocercas" className="text-sm text-blue-700 underline">
          {tr("common.actions.back", "Volver")}
        </Link>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="p-4 text-sm text-slate-700">
        {tr("geocercas.errorLoad", "No se pudo cargar la geocerca.")}{" "}
        <Link to="/geocercas" className="text-blue-700 underline">
          {tr("common.actions.back", "Volver")}
        </Link>
      </div>
    );
  }

  return (
    <div
      style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 16 }}
      className="p-4"
    >
      <section>
        <h3>{item.name}</h3>
        <p>
          <Link to="/geocercas">
            ← {tr("common.actions.back", "Volver")}
          </Link>
        </p>
        <p>
          <b>{tr("reports.table.start", "Inicio")}:</b>{" "}
          {item.created_at ? new Date(item.created_at).toLocaleString() : "—"}
        </p>
        <pre
          style={{
            background: "#f6f6f6",
            padding: 8,
            maxHeight: 300,
            overflow: "auto",
          }}
        >
{JSON.stringify(item.geojson, null, 2)}
        </pre>
      </section>

      <section>
        <MapContainer
          center={[-0.18, -78.47]}
          zoom={14}
          style={{ width: "100%", height: "80vh", borderRadius: 12 }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <GeoJSON data={item.geojson} style={{ color: "#16a34a" }} />
          <FitBounds geojson={item.geojson} />
        </MapContainer>
      </section>
    </div>
  );
}
