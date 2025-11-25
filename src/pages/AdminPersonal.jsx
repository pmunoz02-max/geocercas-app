// src/pages/AdminPersonal.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";

export default function AdminPersonal() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]); // {id, email, telefono, geocercas[]}
  const [geoOpts, setGeoOpts] = useState([]); // {id, name}

  const [filter, setFilter] = useState("");
  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return rows;
    return rows.filter(r =>
      r.email.toLowerCase().includes(f) ||
      (r.telefono || "").toLowerCase().includes(f) ||
      (r.geocercas || []).some(g => g.toLowerCase().includes(f))
    );
  }, [rows, filter]);

  async function loadAll() {
    setLoading(true);
    // Usuarios + agregados
    const { data: people, error } = await supabase.rpc("f_admin_personal");
    if (error) {
      console.error(error);
      setRows([]);
    } else {
      setRows(people || []);
    }
    // Geocercas
    const { data: geos, error: gErr } = await supabase
      .from("geocercas")
      .select("id, name")
      .order("name", { ascending: true });
    if (gErr) console.error(gErr);
    setGeoOpts(geos || []);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function assignFence(userId, geocercaId) {
    if (!geocercaId) return;
    const { error } = await supabase.rpc("rpc_admin_assign_geocerca", {
      p_user_id: userId,
      p_geocerca_id: geocercaId,
    });
    if (error) {
      alert("Error asignando geocerca: " + error.message);
      return;
    }
    await loadAll();
  }

  async function savePhone(userId, telefono) {
    const { error } = await supabase.rpc("rpc_admin_upsert_phone", {
      p_user_id: userId,
      p_telefono: telefono || null,
    });
    if (error) {
      alert("Error guardando teléfono: " + error.message);
      return;
    }
    await loadAll();
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Personal</h1>
        <button onClick={loadAll} className="px-3 py-2 border rounded">
          Recargar
        </button>
      </div>

      <p className="text-gray-600 mb-4">
        Gestión de usuarios, roles y permisos.
      </p>

      <div className="mb-4">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full border rounded px-3 py-2"
          placeholder="Buscar por email, teléfono o geocerca…"
        />
      </div>

      {loading ? (
        <p>Cargando…</p>
      ) : (
        <div className="overflow-x-auto border rounded">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-2">Email</th>
                <th className="text-left p-2">Teléfono</th>
                <th className="text-left p-2">Geocercas asignadas</th>
                <th className="text-left p-2">Asignar geocerca</th>
                <th className="text-left p-2">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <Row
                  key={r.id}
                  row={r}
                  geoOpts={geoOpts}
                  onAssign={assignFence}
                  onSavePhone={savePhone}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Row({ row, geoOpts, onAssign, onSavePhone }) {
  const [tel, setTel] = useState(row.telefono || "");
  const [selGeo, setSelGeo] = useState("");

  return (
    <tr className="border-t">
      <td className="p-2">{row.email}</td>
      <td className="p-2">
        <div className="flex gap-2">
          <input
            value={tel}
            onChange={(e) => setTel(e.target.value)}
            placeholder="+5939xxxxxxx"
            className="border rounded px-2 py-1"
            style={{ minWidth: 160 }}
          />
          <button
            className="px-3 py-1 border rounded"
            onClick={() => onSavePhone(row.id, tel)}
          >
            Guardar
          </button>
        </div>
      </td>
      <td className="p-2">
        {row.geocercas?.length ? row.geocercas.join(", ") : <em>—</em>}
      </td>
      <td className="p-2">
        <div className="flex gap-2">
          <select
            value={selGeo}
            onChange={(e) => setSelGeo(e.target.value)}
            className="border rounded px-2 py-1"
          >
            <option value="">Selecciona…</option>
            {geoOpts.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <button
            className="px-3 py-1 border rounded"
            onClick={() => onAssign(row.id, selGeo)}
            disabled={!selGeo}
          >
            Asignar
          </button>
        </div>
      </td>
      <td className="p-2">
        {/* aquí podremos añadir desasignar, reset pass, etc. */}
      </td>
    </tr>
  );
}
