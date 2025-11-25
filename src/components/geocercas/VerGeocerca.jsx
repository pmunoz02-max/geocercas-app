import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { fetchGeocercaById } from "../../services/geocercas";

// Si usas Leaflet/React-Leaflet, importa lo que necesites aquí:
// import { GeoJSON, useMap } from "react-leaflet";

export default function VerGeocerca() {
  const { id } = useParams(); // asume ruta tipo /geocercas/:id (puede ser UUID o id_text)
  const [loading, setLoading] = useState(true);
  const [geocerca, setGeocerca] = useState(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      try {
        const data = await fetchGeocercaById(id);
        if (!mounted) return;
        setGeocerca(data);
        // Aquí podrías dibujar la capa en Leaflet si corresponde
        // p.ej.: map.fitBounds(L.geoJSON(data.geom).getBounds())
      } catch (err) {
        // Mostrar el error real para depurar
        console.error("[VerGeocerca] Error al cargar geocerca:", err);
        const extra = err?.cause?.message ? `\n(${err.cause.message})` : "";
        alert(`Error al cargar geocerca.\n${err.message || ""}${extra}`);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    if (id) load();
    return () => {
      mounted = false;
    };
  }, [id]);

  if (loading) return <div>Cargando geocerca…</div>;
  if (!geocerca) return <div>No se encontraron datos.</div>;

  // Render mínimo de verificación
  return (
    <div className="space-y-2">
      <h2 className="text-xl font-semibold">Geocerca</h2>
      <div><b>ID:</b> {geocerca.id}</div>
      <div><b>ID texto:</b> {geocerca.id_text}</div>
      <div><b>Nombre:</b> {geocerca.name}</div>
      <div><b>Descripción:</b> {geocerca.descripcion}</div>
      <pre className="bg-gray-100 p-3 rounded overflow-auto">
        {JSON.stringify(geocerca.geom, null, 2)}
      </pre>
    </div>
  );
}
