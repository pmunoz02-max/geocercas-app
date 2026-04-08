// src/pages/AdminPersonal.jsx
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../supabaseClient";

export default function AdminPersonal() {
  const { t } = useTranslation();

  const tt = (key, fallback, options = {}) => {
    try {
      const value = t(key, { defaultValue: fallback, ...options });
      if (typeof value !== "string") return fallback;
      const normalized = value.trim();
      if (!normalized || normalized === key) return fallback;
      return value;
    } catch {
      return fallback;
    }
  };

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]); // {id, email, telefono, geocercas[]}
  const [geoOpts, setGeoOpts] = useState([]); // {id, name}

  const [filter, setFilter] = useState("");
  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return rows;
    return rows.filter((r) =>
      r.email.toLowerCase().includes(f) ||
      (r.telefono || "").toLowerCase().includes(f) ||
      (r.geocercas || []).some((g) => g.toLowerCase().includes(f))
    );
  }, [rows, filter]);

  async function loadAll() {
    setLoading(true);

    const { data: people, error } = await supabase.rpc("f_admin_personal");
    if (error) {
      console.error("[AdminPersonal] f_admin_personal error:", error);
      setRows([]);
    } else {
      setRows(people || []);
    }

    const { data: geos, error: gErr } = await supabase
      .from("geocercas")
      .select("id, name")
      .order("name", { ascending: true });

    if (gErr) console.error("[AdminPersonal] geocercas load error:", gErr);
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
      alert(tt("adminPersonal.messages.assignFenceError", "No se pudo asignar la geocerca."));
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
      alert(tt("adminPersonal.messages.savePhoneError", "No se pudo guardar el teléfono."));
      return;
    }

    await loadAll();
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">
          {tt("adminPersonal.title", "Personnel")}
        </h1>
        <button onClick={loadAll} className="px-3 py-2 border rounded">
          {tt("adminPersonal.actions.reload", "Reload")}
        </button>
      </div>

      <p className="text-gray-600 mb-4">
        {tt("adminPersonal.subtitle", "User, role, and permission management.")}
      </p>

      <div className="mb-4">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full border rounded px-3 py-2"
          placeholder={tt(
            "adminPersonal.filters.searchPlaceholder",
            "Search by email, phone, or geofence…"
          )}
        />
      </div>

      {loading ? (
        <p>{tt("adminPersonal.states.loading", "Loading…")}</p>
      ) : (
        <div className="overflow-x-auto border rounded">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-2">
                  {tt("adminPersonal.table.email", "Email")}
                </th>
                <th className="text-left p-2">
                  {tt("adminPersonal.table.phone", "Phone")}
                </th>
                <th className="text-left p-2">
                  {tt("adminPersonal.table.assignedGeofences", "Assigned geofences")}
                </th>
                <th className="text-left p-2">
                  {tt("adminPersonal.table.assignGeofence", "Assign geofence")}
                </th>
                <th className="text-left p-2">
                  {tt("adminPersonal.table.actions", "Actions")}
                </th>
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
                  tt={tt}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Row({ row, geoOpts, onAssign, onSavePhone, tt }) {
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
            placeholder={tt("adminPersonal.form.phonePlaceholder", "+5939xxxxxxx")}
            className="border rounded px-2 py-1"
            style={{ minWidth: 160 }}
          />
          <button
            className="px-3 py-1 border rounded"
            onClick={() => onSavePhone(row.id, tel)}
          >
            {tt("adminPersonal.actions.save", "Save")}
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
            <option value="">
              {tt("adminPersonal.form.selectGeofence", "Select…")}
            </option>
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
            {tt("adminPersonal.actions.assign", "Assign")}
          </button>
        </div>
      </td>
      <td className="p-2">
        {/* future actions: unassign, reset password, etc. */}
      </td>
    </tr>
  );
}
