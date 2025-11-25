// src/components/tracker/AttendancePanel.jsx
import React from 'react';

export default function AttendancePanel({ positions = [] }) {
  return (
    <div className="w-full overflow-auto border rounded-xl p-3">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-left border-b">
            <th className="py-2 pr-3">Usuario</th>
            <th className="py-2 pr-3">Lat</th>
            <th className="py-2 pr-3">Lng</th>
            <th className="py-2 pr-3">Accuracy (m)</th>
            <th className="py-2 pr-3">Timestamp</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => (
            <tr key={p.user_id} className="border-b last:border-0">
              <td className="py-2 pr-3 font-mono">{p.user_id}</td>
              <td className="py-2 pr-3">{typeof p.lat === 'number' ? p.lat.toFixed(6) : '—'}</td>
              <td className="py-2 pr-3">{typeof p.lng === 'number' ? p.lng.toFixed(6) : '—'}</td>
              <td className="py-2 pr-3">{p.accuracy != null ? Math.round(p.accuracy) : '—'}</td>
              <td className="py-2 pr-3">{p.ts ? new Date(p.ts).toLocaleString() : '—'}</td>
            </tr>
          ))}
          {!positions.length && (
            <tr><td colSpan={5} className="py-6 text-center text-gray-500">Sin datos aún…</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
