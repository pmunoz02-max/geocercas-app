// src/components/tracker/TrackerPage.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Tooltip, Popup, GeoJSON, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';

import { supabase } from '../../supabaseClient';
import { suscribirsePosiciones } from '../../lib/trackerApi';

// =============== Icono básico de tracker =================
const trackerIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28],
  shadowSize: [41, 41],
});

// =============== Utils de tiempo/formatos =================
function fmtTs(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}
function fmtVel(speed) {
  if (speed === null || speed === undefined) return '—';
  return `${speed} m/s`;
}

// =============== Geometría: point in polygon =================
function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = ((yi > y) !== (yj > y)) &&
      (x < ((xj - xi) * (y - yi)) / (yj - yi + 0.0) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}
function pointInPolygon(point, polygonCoords) {
  if (!polygonCoords || polygonCoords.length === 0) return false;
  const insideOuter = pointInRing(point, polygonCoords[0]);
  if (!insideOuter) return false;
  for (let i = 1; i < polygonCoords.length; i++) {
    if (pointInRing(point, polygonCoords[i])) return false;
  }
  return true;
}
function pointInMultiPolygon(point, multiPolygonCoords) {
  for (const poly of multiPolygonCoords) {
    if (pointInPolygon(point, poly)) return true;
  }
  return false;
}
function isPointInsideGeoJSON(lng, lat, geojson) {
  if (!geojson) return false;
  const pt = [lng, lat];
  try {
    if (geojson.type === 'Feature') return isPointInsideGeoJSON(lng, lat, geojson.geometry);
    if (geojson.type === 'FeatureCollection' && geojson.features?.length) {
      return geojson.features.some(f => isPointInsideGeoJSON(lng, lat, f));
    }
    if (geojson.type === 'Polygon') return pointInPolygon(pt, geojson.coordinates);
    if (geojson.type === 'MultiPolygon') return pointInMultiPolygon(pt, geojson.coordinates);
    return false;
  } catch {
    return false;
  }
}

// =============== Hook auxiliar: fit bounds imperativo =========
function FitBounds({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds.isValid && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [30, 30] });
    }
  }, [bounds, map]);
  return null;
}

// =============== Componente principal ========================
export default function TrackerPage() {
  // Datos de filtros
  const [personas, setPersonas] = useState([]);
  const [geocercas, setGeocercas] = useState([]);
  const [selectedPersona, setSelectedPersona] = useState('');
  const [selectedGeocerca, setSelectedGeocerca] = useState('');
  const [estado, setEstado] = useState('all'); // all | inside | outside

  // Datos de runtime
  const [positions, setPositions] = useState([]); // últimas posiciones por persona
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Geometría activa
  const activeGeocerca = useMemo(
    () => geocercas.find(g => g.id === selectedGeocerca) || null,
    [geocercas, selectedGeocerca]
  );

  // Mapa refs
  const mapRef = useRef(null);
  const [fitBounds, setFitBounds] = useState(null);

  // Diccionario persona por id
  const personaById = useMemo(() => {
    const m = new Map();
    for (const p of personas) m.set(p.id, p);
    return m;
  }, [personas]);

  // ============ Cargar catálogos: personas & geocercas ============
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError('');
      try {
        // Personas: leemos ambos campos (activo | vigente) y derivamos un flag
        const { data: pData, error: pErr } = await supabase
          .from('personal')
          .select('id, nombre, apellido, activo, vigente') // alguno puede no existir
          .order('nombre', { ascending: true });

        if (pErr) throw new Error(pErr.message);

        const personasNorm = (pData || []).map(p => ({
          id: p.id,
          nombre: p.nombre,
          apellido: p.apellido,
          activo: (typeof p.activo === 'boolean') ? p.activo :
                  (typeof p.vigente === 'boolean') ? p.vigente : true,
        }));

        // Geocercas
        const { data: gData, error: gErr } = await supabase
          .from('geocercas')
          .select('id, nombre, activo, geojson')
          .order('nombre', { ascending: true });

        if (gErr) throw new Error(gErr.message);

        if (!mounted) return;
        setPersonas(personasNorm || []);
        setGeocercas(gData || []);
      } catch (e) {
        if (!mounted) return;
        setError(e.message || 'Error cargando catálogos');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // ============ Suscripción realtime + fallback polling ============
  useEffect(() => {
    setError('');
    const filtros = {
      personal_id: selectedPersona || null,
      geocerca_id: selectedGeocerca || null,
      sinceMinutes: 1440,
    };

    const controller = suscribirsePosiciones((evt) => {
      if (evt.type === 'snapshot' || evt.type === 'poll') {
        setPositions(evt.rows || []);
      } else if (evt.type === 'realtime') {
        const row = evt.row || {};
        setPositions(prev => {
          const idx = prev.findIndex(p => p.personal_id === row.personal_id);
          if (idx === -1) return [row, ...prev];
          const clone = [...prev];
          if (new Date(row.ts) >= new Date(prev[idx].ts)) clone[idx] = row;
          return clone;
        });
      } else if (evt.type.endsWith('_error')) {
        setError(evt.error?.message || 'Error en tracking (realtime/polling)');
      }
    }, {
      filtros,
      intervalMs: 10000,
      enablePollingBackup: true,
      events: ['INSERT', 'UPDATE'],
    });

    return () => controller?.stop?.();
  }, [selectedPersona, selectedGeocerca]);

  // ============ Filtro de estado: dentro / fuera ===================
  const positionsFiltered = useMemo(() => {
    if (!activeGeocerca || estado === 'all') return positions;
    const gj = activeGeocerca.geojson;
    return positions.filter(p => {
      const inside = isPointInsideGeoJSON(p.lng, p.lat, gj);
      return estado === 'inside' ? inside : !inside;
    });
  }, [positions, estado, activeGeocerca]);

  // ============ Bounds helpers ====================================
  function computeBoundsFromPositions(rows) {
    const latlngs = rows
      .filter(r => typeof r.lat === 'number' && typeof r.lng === 'number')
      .map(r => [r.lat, r.lng]);
    if (!latlngs.length) return null;
    return L.latLngBounds(latlngs);
  }
  function computeBoundsFromGeoJSON(gj) {
    if (!gj) return null;
    try {
      const layer = L.geoJSON(gj);
      return layer.getBounds?.() || null;
    } catch {
      return null;
    }
  }

  const boundsActiveTrackers = useMemo(
    () => computeBoundsFromPositions(positionsFiltered),
    [positionsFiltered]
  );
  const boundsActiveGeocerca = useMemo(
    () => computeBoundsFromGeoJSON(activeGeocerca?.geojson),
    [activeGeocerca]
  );

  // ============ Handlers de UI ====================================
  const centerOnTrackers = () => { if (boundsActiveTrackers) setFitBounds(boundsActiveTrackers); };
  const centerOnGeocerca = () => { if (boundsActiveGeocerca) setFitBounds(boundsActiveGeocerca); };

  // ============ Render ============================================
  return (
    <div className="flex h-[calc(100vh-80px)] w-full">
      {/* Sidebar con alto contraste y controles claros */}
      <aside
        className="w-80 min-w-72 max-w-96 border-r border-gray-200 p-4 space-y-4 overflow-y-auto"
        style={{ background: '#f8fafc', color: '#0f172a' }} // fondo claro, texto oscuro
      >
        <h2 className="text-xl font-semibold">Tracker (En vivo)</h2>

        <div className="space-y-2">
          <label className="text-sm font-semibold">Persona</label>
          <select
            value={selectedPersona}
            onChange={(e) => setSelectedPersona(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 bg-white text-slate-900"
          >
            <option value="">Todas</option>
            {personas.map(p => (
              <option key={p.id} value={p.id}>
                {p.nombre} {p.apellido ? p.apellido : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold">Geocerca</label>
          <select
            value={selectedGeocerca}
            onChange={(e) => setSelectedGeocerca(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 bg-white text-slate-900"
          >
            <option value="">Todas</option>
            {geocercas.map(g => (
              <option key={g.id} value={g.id}>
                {g.nombre}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold">
            Estado <span className="text-xs text-slate-600">(requiere geocerca)</span>
          </label>
          <select
            value={estado}
            onChange={(e) => setEstado(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 bg-white text-slate-900 disabled:bg-gray-100 disabled:text-gray-500"
            disabled={!selectedGeocerca}
            title={!selectedGeocerca ? 'Seleccione una geocerca para filtrar por estado' : ''}
          >
            <option value="all">Todos</option>
            <option value="inside">Dentro de geocerca</option>
            <option value="outside">Fuera de geocerca</option>
          </select>
        </div>

        <div className="flex gap-2">
          <button
            onClick={centerOnGeocerca}
            className="flex-1 rounded-md bg-blue-600 text-white px-3 py-2 hover:bg-blue-700 disabled:bg-blue-300"
            disabled={!boundsActiveGeocerca}
          >
            Centrar en geocerca
          </button>
          <button
            onClick={centerOnTrackers}
            className="flex-1 rounded-md bg-emerald-600 text-white px-3 py-2 hover:bg-emerald-700 disabled:bg-emerald-300"
            disabled={!boundsActiveTrackers}
          >
            Centrar en trackers
          </button>
        </div>

        <div className="pt-2 text-sm text-slate-700">
          <div>Trackers activos: <b>{positionsFiltered.length}</b></div>
          {loading && <div className="text-slate-500">Cargando catálogos…</div>}
          {error && <div className="text-red-600">Error: {error}</div>}
        </div>

        {/* Lista compacta */}
        <div className="max-h-[40vh] overflow-auto border rounded-md p-2 bg-white">
          {positionsFiltered.length === 0 ? (
            <div className="text-sm text-slate-600">Sin posiciones recientes.</div>
          ) : (
            <ul className="space-y-1">
              {positionsFiltered.map(pos => {
                const per = personaById.get(pos.personal_id);
                return (
                  <li key={pos.personal_id} className="text-sm text-slate-800">
                    <span className="font-medium">
                      {per ? `${per.nombre} ${per.apellido || ''}` : pos.personal_id}
                    </span>
                    <span className="text-slate-500"> · {fmtTs(pos.ts)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      {/* Mapa */}
      <section className="flex-1 relative">
        {fitBounds && <FitBounds bounds={fitBounds} />}
        <MapContainer
          center={[-1.8312, -78.1834]}
          zoom={6}
          minZoom={2}
          style={{ height: '100%', width: '100%' }}
          whenCreated={(map) => (mapRef.current = map)}
        >
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {activeGeocerca?.geojson && (
            <GeoJSON
              key={activeGeocerca.id}
              data={activeGeocerca.geojson}
              style={{ color: '#2563eb', weight: 2, fillOpacity: 0.08 }}
              eventHandlers={{
                add: (e) => {
                  const b = e.layer?.getBounds?.();
                  if (b && (!fitBounds || !fitBounds.isValid || !fitBounds.isValid())) {
                    setFitBounds(b);
                  }
                },
              }}
            />
          )}

          <MarkerClusterGroup chunkedLoading maxClusterRadius={60}>
            {positionsFiltered.map((pos) => {
              const per = personaById.get(pos.personal_id);
              return (
                <Marker key={pos.personal_id} position={[pos.lat, pos.lng]} icon={trackerIcon}>
                  <Tooltip direction="top" offset={[0, -28]} opacity={1}>
                    <div className="text-sm">
                      <div className="font-semibold">
                        {per ? `${per.nombre} ${per.apellido || ''}` : pos.personal_id}
                      </div>
                      <div>Velocidad: {fmtVel(pos.speed)}</div>
                      <div>Último: {fmtTs(pos.ts)}</div>
                    </div>
                  </Tooltip>
                  <Popup>
                    <div className="text-sm">
                      <div className="font-semibold text-base mb-1">
                        {per ? `${per.nombre} ${per.apellido || ''}` : pos.personal_id}
                      </div>
                      <div><b>Lat:</b> {pos.lat}</div>
                      <div><b>Lng:</b> {pos.lng}</div>
                      <div><b>Velocidad:</b> {fmtVel(pos.speed)}</div>
                      <div><b>Batería:</b> {pos.battery ?? '—'}</div>
                      <div><b>Actualizado:</b> {fmtTs(pos.ts)}</div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MarkerClusterGroup>
        </MapContainer>
      </section>
    </div>
  );
}
