// src/components/GeocercasActivas.jsx
import { useEffect, useState } from 'react';
import { listarGeocercasActivas, cambiarEstadoGeocerca } from '../services/geocercas';

export default function GeocercasActivas() {
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(0);
  const [limit] = useState(20);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const offset = (page - 1) * limit;

  const fetchData = async () => {
    setLoading(true);
    const { data, error, count: total } = await listarGeocercasActivas({
      limit,
      offset,
      search,
    });
    setLoading(false);
    if (error) {
      // eslint-disable-next-line no-alert
      alert(error.message || 'Error cargando geocercas activas');
      return;
    }
    setRows(data || []);
    setCount(total || 0);
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const onSearch = (e) => {
    e.preventDefault();
    setPage(1);
    fetchData();
  };

  const totalPages = Math.max(1, Math.ceil(count / limit));

  const desactivar = async (id) => {
    const ok = confirm('¿Deseas desactivar esta geocerca?');
    if (!ok) return;
    const { error } = await cambiarEstadoGeocerca(id, false);
    if (error) {
      alert(error.message || 'No se pudo desactivar');
      return;
    }
    fetchData();
  };

  return (
    <div className="space-y-3">
      <form onSubmit={onSearch} className="flex items-center gap-2">
        <input
          type="text"
          className="w-full rounded border px-3 py-2"
          placeholder="Buscar por nombre..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          className="rounded bg-gray-800 px-4 py-2 text-white"
          type="submit"
          disabled={loading}
        >
          Buscar
        </button>
      </form>

      <div className="overflow-x-auto rounded border">
        <table className="min-w-full">
          <thead>
            <tr className="bg-gray-100 text-left">
              <th className="px-3 py-2">Nombre</th>
              <th className="px-3 py-2">Activa</th>
              <th className="px-3 py-2">Creada</th>
              <th className="px-3 py-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-3 py-2" colSpan={4}>Cargando...</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="px-3 py-2" colSpan={4}>Sin resultados</td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2">{r.nombre}</td>
                  <td className="px-3 py-2">{r.activa ? 'Sí' : 'No'}</td>
                  <td className="px-3 py-2">
                    {r.created_at ? new Date(r.created_at).toLocaleString() : '-'}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      className="rounded bg-red-600 px-3 py-1 text-white"
                      onClick={() => desactivar(r.id)}
                      title="Desactivar"
                    >
                      Desactivar
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm">Total: {count}</span>
        <div className="flex items-center gap-2">
          <button
            className="rounded border px-3 py-1"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            ← Anterior
          </button>
          <span className="text-sm">
            Página {page} de {totalPages}
          </span>
          <button
            className="rounded border px-3 py-1"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Siguiente →
          </button>
        </div>
      </div>
    </div>
  );
}
