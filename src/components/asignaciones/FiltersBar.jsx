// src/components/asignaciones/FiltersBar.jsx
import React from 'react';
import { useTranslation } from 'react-i18next';

export default function FiltersBar({
  q, setQ,
  estado, setEstado,
  from, setFrom,
  to, setTo,
  geocercas, personal,
  geocercaId, setGeocercaId,
  personalId, setPersonalId,
  onRefresh,
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-3 p-3 bg-white/70 rounded-2xl shadow">
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        <input
          type="text"
          className="border rounded-xl px-3 py-2"
          placeholder={t("asignaciones.filters.searchPlaceholder")}

        <select
          className="border rounded-xl px-3 py-2"
          value={estado}
          onChange={(e) => setEstado(e.target.value)}
        >
          <option value="todos">{t("asignaciones.filters.statusAll")}</option>
          <option value="activa">{t("common.states.active")}</option>
          <option value="inactiva">{t("common.states.inactive")}</option>
          <option value="pendiente">{t("common.states.pending")}</option>
        </select>

        <select
          className="border rounded-xl px-3 py-2"
          value={geocercaId || ''}
          onChange={(e) => setGeocercaId(e.target.value || null)}
        >
          <option value="">{t("asignaciones.filters.geofenceAll")}</option>
          {geocercas.map((g) => (
            <option key={g.id} value={g.id}>{g.nombre}</option>
          ))}
        </select>

        <select
          className="border rounded-xl px-3 py-2"
          value={personalId || ''}
          onChange={(e) => setPersonalId(e.target.value || null)}
        >
          <option value="">{t("asignaciones.filters.personalAll")}</option>
          {personal.map((p) => (
            <option key={p.id} value={p.id}>
              {`${p.nombre ?? ''} ${p.apellido ?? ''}`.trim() || p.email}
            </option>
          ))}
        </select>

        <div className="flex gap-2">
          <input
            type="date"
            className="border rounded-xl px-3 py-2 w-full"
            value={from || ''}
            onChange={(e) => setFrom(e.target.value || null)}
          />
          <input
            type="date"
            className="border rounded-xl px-3 py-2 w-full"
            value={to || ''}
            onChange={(e) => setTo(e.target.value || null)}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={onRefresh}
          className="px-4 py-2 rounded-xl bg-black text-white hover:opacity-90"
        >
          {t("common.refresh")}
        </button>
      </div>
    </div>
  );
}
