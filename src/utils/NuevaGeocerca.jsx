// src/utils/NuevaGeocerca.jsx
import { useRef, useState } from 'react';
import { MapContainer, TileLayer, FeatureGroup } from 'react-leaflet';
import { EditControl } from 'react-leaflet-draw';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';

import supabase from '../lib/supabaseClient';
import { crearGeocerca } from '../services/geocercas';

export default function NuevaGeocerca() {
  const [nombre, setNombre] = useState('Casa');
  const [textoCoords, setTextoCoords] = useState(''); // líneas "lat, lng"
  const [guardando, setGuardando] = useState(false);

  // guardamos el último polígono dibujado como array [{lat,lng}, ...]
  const drawnLatLngsRef = useRef(null);
  const fgRef = useRef(null);

  const onCreated = (e) => {
    if (e.layerType === 'polygon') {
      const arr = e.layer.getLatLngs();
      const ring = Array.isArray(arr) ? arr[0] : [];
      const latlngs =
        Array.isArray(ring) && Array.isArray(ring[0])
          ? ring[0]
          : ring;

      drawnLatLngsRef.current = latlngs?.map(p => ({ lat: p.lat, lng: p.lng })) || null;

      if (fgRef.current) {
        const group = fgRef.current;
        group.eachLayer((layer) => {
          if (layer !== e.layer) {
            group.removeLayer(layer);
          }
        });
      }
    }
  };

  const onDeleted = () => {
    drawnLatLngsRef.current = null;
  };

  async function onGuardar() {
    try {
      setGuardando(true);

      const txt = (textoCoords || '').trim();
      const geometriaInput = txt.length > 0 ? txt : drawnLatLngsRef.current;

      // ✅ Validación real (esto sí debe avisar)
      if (!geometriaInput || (Array.isArray(geometriaInput) && geometriaInput.length < 3)) {
        alert('Agrega coordenadas (texto "lat, lng" por línea) o dibuja un polígono en el mapa.');
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      const ownerId = user?.id;

      await crearGeocerca({ nombre: (nombre || '').trim(), geometria: geometriaInput }, ownerId);

      // ✅ Guardado → SILENCIO (sin alert)
      setTextoCoords('');
      drawnLatLngsRef.current = null;
      if (fgRef.current) fgRef.current.clearLayers();
    } catch (e) {
      // ❗ No mostrar error: podría haberse guardado aunque haya fallo de respuesta/red
      console.error('[utils/NuevaGeocerca] Error durante guardar (silencioso):', e);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
      <div>
        <h2 className="font-bold text-xl mb-3">Nueva Geocerca</h2>

        <label className="block text-sm font-medium mb-1">Nombre</label>
        <input
          className="w-full border rounded px-3 py-2 mb-3"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre de la geocerca"
        />

        <label className="block text-sm font-medium mb-1">
          Coordenadas <span className="font-normal">(lat, lng) por línea</span>
        </label>
        <textarea
          className="w-full border rounded px-3 py-2 h-48 font-mono text-sm"
          value={textoCoords}
          onChange={(e) => setTextoCoords(e.target.value)}
          placeholder="-0.064778, -78.479860
-0.084176, -78.479345
-0.081773, -78.442266
-0.060658, -78.446043"
        />

        <button
          className="mt-4 bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-60"
          onClick={onGuardar}
          disabled={guardando}
        >
          {guardando ? 'Guardando…' : 'Guardar Geocerca'}
        </button>

        <p className="text-xs text-gray-500 mt-2">
          Si el cuadro queda vacío, <b>se usará el polígono dibujado</b> en el mapa.
        </p>
      </div>

      <div>
        <MapContainer
          center={[-0.07, -78.47]}
          zoom={13}
          style={{ height: 480, width: '100%', borderRadius: 12 }}
        >
          <TileLayer
            attribution="&copy; OpenStreetMap"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FeatureGroup ref={fgRef}>
            <EditControl
              position="topright"
              onCreated={onCreated}
              onDeleted={onDeleted}
              draw={{
                rectangle: false,
                circle: false,
                circlemarker: false,
                marker: false,
                polyline: false,
                polygon: {
                  allowIntersection: false,
                  showArea: true,
                },
              }}
            />
          </FeatureGroup>
        </MapContainer>
      </div>
    </div>
  );
}
