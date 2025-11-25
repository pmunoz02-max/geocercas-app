import React from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient.js";
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
      const b = layer.getBounds?.();
      if (b) map.fitBounds(b.pad(0.2));
    } catch {}
  }, [geojson, map]);
  return null;
}

export default function VerGeocerca() {
  const { id } = useParams();
  const [item, setItem] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.from("geofences").select("*").eq("id", id).single();
      setLoading(false);
      if (error) return alert("No se pudo cargar la geocerca");
      setItem(data);
    })();
  }, [id]);

  if (loading) return <div>Cargando...</div>;
  if (!item) return <div>No encontrada. <Link to="/geocercas">Volver</Link></div>;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 16 }}>
      <section>
        <h3>{item.name}</h3>
        <p><Link to="/geocercas">← Volver al listado</Link></p>
        <p><b>Creada:</b> {new Date(item.created_at).toLocaleString()}</p>
        <pre style={{ background: "#f6f6f6", padding: 8, maxHeight: 300, overflow: "auto" }}>
{JSON.stringify(item.geojson, null, 2)}
        </pre>
      </section>

      <section>
        <MapContainer center={[-0.18, -78.47]} zoom={14} style={{ width: "100%", height: "80vh", borderRadius: 12 }}>
          <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <GeoJSON data={item.geojson} style={{ color: "#16a34a" }} />
          <FitBounds geojson={item.geojson} />
        </MapContainer>
      </section>
    </div>
  );
}
