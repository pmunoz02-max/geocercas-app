// src/components/CrearGeocercaForm.jsx
import { useState } from 'react';
import { crearGeocerca } from '../services/geocercas';

export default function CrearGeocercaForm({ geom }) {
  const [nombre, setNombre] = useState('');
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
      setErrorMsg(error.message || 'Error creando geocerca');
      return;
    }
    setMensaje(`Geocerca "${data.nombre}" creada correctamente`);
    setNombre('');
    setActiva(true);
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <label className="block text-sm font-medium">Nombre de la geocerca</label>
        <input
          type="text"
          className="mt-1 w-full rounded border px-3 py-2"
          placeholder="Ej. Zona Norte"
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
        <label htmlFor="activa" className="text-sm">Activa</label>
      </div>

      <button
        type="submit"
        className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
        disabled={loading}
      >
        {loading ? 'Creando...' : 'Crear geocerca'}
      </button>

      {mensaje && <p className="text-green-700 text-sm">{mensaje}</p>}
      {errorMsg && <p className="text-red-700 text-sm">{errorMsg}</p>}
    </form>
  );
}
