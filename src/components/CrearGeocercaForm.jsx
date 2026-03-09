// src/components/CrearGeocercaForm.jsx
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { crearGeocerca } from "../services/geocercas";

export default function CrearGeocercaForm({ geom }) {
  const { t } = useTranslation();
  const tr = (key, fallback, options = {}) =>
    t(key, { defaultValue: fallback, ...options });

  const [nombre, setNombre] = useState("");
  const [activa, setActiva] = useState(true);
  const [loading, setLoading] = useState(false);
  const [mensaje, setMensaje] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  const onSubmit = async (e) => {
    e.preventDefault();
    setMensaje(null);
    setErrorMsg(null);
    setLoading(true);

    const { data, error } = await crearGeocerca({ nombre, geom, activa });

    setLoading(false);

    if (error) {
      setErrorMsg(
        error.message ||
          tr("createGeofence.errors.create", "Error creating geofence")
      );
      return;
    }

    setMensaje(
      tr(
        "createGeofence.messages.success",
        'Geofence "{{name}}" created successfully',
        { name: data.nombre }
      )
    );
    setNombre("");
    setActiva(true);
  };

  return (
    <form onSubmit={onSubmit} className="space-y-2 sm:space-y-3">
      <div>
        <label className="block !text-xs sm:!text-sm font-medium">
          {tr("createGeofence.fields.name", "Geofence name")}
        </label>

        <input
          type="text"
          className="
            mt-1 w-full rounded border
            !px-3 !py-2 !text-xs
            sm:!px-3 sm:!py-2 sm:!text-sm
            lg:!px-4 lg:!py-2.5 lg:!text-sm
          "
          placeholder={tr("createGeofence.fields.namePlaceholder", "E.g. North Zone")}
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          required
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          id="activa"
          type="checkbox"
          checked={activa}
          onChange={(e) => setActiva(e.target.checked)}
        />
        <label htmlFor="activa" className="!text-xs sm:!text-sm">
          {tr("createGeofence.fields.active", "Active")}
        </label>
      </div>

      <button
        type="submit"
        className="
          rounded bg-blue-600 text-white disabled:opacity-50
          !px-3 !py-2 !text-xs
          sm:!px-4 sm:!py-2 sm:!text-sm
          lg:!px-4 lg:!py-2.5 lg:!text-sm
        "
        disabled={loading}
      >
        {loading
          ? tr("createGeofence.actions.creating", "Creating...")
          : tr("createGeofence.actions.submit", "Create geofence")}
      </button>

      {mensaje && <p className="text-green-700 !text-xs sm:!text-sm">{mensaje}</p>}
      {errorMsg && <p className="text-red-700 !text-xs sm:!text-sm">{errorMsg}</p>}
    </form>
  );
}