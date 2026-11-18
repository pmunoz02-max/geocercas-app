import React, { useEffect, useMemo } from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { incidentObservationSeries } from '../lib/incidentReport';
import 'leaflet/dist/leaflet.css';

const severityStyles = {
  low: { color: '#15803d', radius: 6 },
  medium: { color: '#facc15', radius: 10 },
  high: { color: '#b91c1c', radius: 14 },
  unknown: { color: '#64748b', radius: 5 },
};
const states = ['detected', 'treating', 'controlled', 'closed'];
const copy = {
  es: { map: 'Mapa de incidencias', missing: 'Sin ubicación válida', progress: 'Evolución del estado', trend: 'Incidencias a lo largo del tiempo', count: 'Incidencias observadas' },
  en: { map: 'Incident map', missing: 'No valid location', progress: 'Status over time', trend: 'Incidents over time', count: 'Observed incidents' },
  fr: { map: 'Carte des incidents', missing: 'Sans position valide', progress: 'Évolution du statut', trend: 'Incidents au fil du temps', count: 'Incidents observés' },
};

function mapPoint(row) {
  const { lat, lng } = row;
  if (lat == null || lng == null || String(lat).trim() === '' || String(lng).trim() === '') return null;
  const point = [Number(lat), Number(lng)];
  return Math.abs(point[0]) <= 90 && Math.abs(point[1]) <= 180 ? point : null;
}

function FitIncidents({ markers }) {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(markers.map(({ point }) => point), { padding: [28, 28], maxZoom: 16, animate: false });
  }, [map, markers]);
  return null;
}

export function IncidentMap({ rows, words, language, onOpen }) {
  const text = copy[language?.slice(0, 2)] || copy.es;
  const markers = useMemo(() => rows.flatMap(row => {
    const point = mapPoint(row);
    return point ? [{ row, point, style: severityStyles[row.severity] || severityStyles.unknown }] : [];
  }).sort((a, b) => b.style.radius - a.style.radius), [rows]);
  const missing = rows.length - markers.length;
  return (
    <section className="space-y-3" aria-label={text.map}>
      <h3 className="text-lg font-semibold text-slate-900">{text.map}</h3>
      <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {Object.entries(severityStyles).map(([key, { color, radius }]) => (
          <li key={key} className="flex items-center gap-2">
            <span aria-hidden="true" className="inline-block rounded-full" style={{ background: color, width: radius * 2, height: radius * 2 }} />
            {words.severities[key]}
          </li>
        ))}
      </ul>
      {missing > 0 && <p className="text-sm text-slate-600">{text.missing} ({missing})</p>}
      {markers.length > 0 && (
        <MapContainer className="relative z-0 h-80 w-full rounded-lg sm:h-96" center={markers[0].point} zoom={13} scrollWheelZoom={false} preferCanvas>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' />
          <FitIncidents markers={markers} />
          {markers.map(({ row, point, style }) => (
            <CircleMarker key={row.id} center={point} radius={style.radius} pathOptions={{ color: '#fff', weight: 2, fillColor: style.color, fillOpacity: 0.9 }}>
              <Popup>
                <strong>{row.title}</strong><br />
                {row.geofence_name_snapshot}<br />
                {words.severities[row.severity]} · {words.states[row.status]}<br />
                <button type="button" className="mt-2 text-emerald-800 underline" onClick={() => onOpen(row.id)}>{words.detail}</button>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      )}
    </section>
  );
}

export function IncidentObservationChart({ rows, language, empty }) {
  const text = copy[language?.slice(0, 2)] || copy.es;
  const { points, unit } = useMemo(() => incidentObservationSeries(rows), [rows]);
  const options = unit === 'day' ? { day: 'numeric', month: 'short' } : unit === 'month' ? { month: 'short', year: 'numeric' } : { year: 'numeric' };
  const tick = new Intl.DateTimeFormat(language, { ...options, timeZone: 'UTC' });
  const tooltipDate = new Intl.DateTimeFormat(language, { ...options, year: 'numeric', timeZone: 'UTC' });

  return (
    <section className="min-w-0 space-y-2 border-t border-slate-200 pt-4" aria-label={text.trend}>
      <h3 className="text-lg font-semibold text-slate-900">{text.trend}</h3>
      {points.length === 0 ? <p className="text-sm text-slate-600">{empty}</p> : (
        <>
          <p className="text-sm text-slate-600">{text.count}</p>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={points} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tickFormatter={date => tick.format(date)} minTickGap={20} tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} width={34} tick={{ fontSize: 11 }} />
                <Tooltip labelFormatter={date => tooltipDate.format(date)} />
                <Bar dataKey="count" name={text.count} fill="#047857" maxBarSize={48} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </section>
  );
}

export function IncidentStatusTimeline({ events, words, language }) {
  const text = copy[language?.slice(0, 2)] || copy.es;
  const points = events.flatMap(event => {
    const state = states.indexOf(event.to_status);
    const time = Date.parse(event.created_at);
    return state >= 0 && Number.isFinite(time) ? [{ state, time }] : [];
  }).sort((a, b) => a.time - b.time);
  if (points.length === 0) return null;

  const tick = new Intl.DateTimeFormat(language, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const statusLabel = value => words.states[states[value]];
  const start = points[0].time;
  const end = points.at(-1).time;
  const padding = Math.max(60_000, (end - start) * 0.04);
  return (
    <section className="min-w-0 space-y-2" aria-label={text.progress}>
      <h3 className="text-lg font-semibold">{text.progress}</h3>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 12, right: 16, bottom: 8, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="time" type="number" domain={[start - padding, end + padding]} tickFormatter={value => tick.format(value)} minTickGap={24} tick={{ fontSize: 11 }} />
            <YAxis type="number" domain={[0, 3]} ticks={[0, 1, 2, 3]} tickFormatter={statusLabel} width={100} tick={{ fontSize: 11 }} />
            <Tooltip labelFormatter={value => new Date(value).toLocaleString(language)} formatter={value => [statusLabel(value), words.status]} />
            <Line dataKey="state" type="stepAfter" stroke="#047857" strokeWidth={2} dot={{ r: 4 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
