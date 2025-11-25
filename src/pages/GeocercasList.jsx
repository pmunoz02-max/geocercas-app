import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient.js";
import { useAuth } from "../context/AuthContext.jsx";

function downloadJSON(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function GeocercasList() {
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const navigate = useNavigate();
  const { user } = useAuth();

  const load = React.useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("geofences")
      .select("*")
      .eq("owner", user?.id ?? "")
      .order("created_at", { ascending: false });
    setLoading(false);
    if (error) return alert("Error cargando geocercas");
    setItems(data || []);
  }, [user?.id]);

  React.useEffect(() => { load(); }, [load]);

  const handleDelete = async (id) => {
    if (!confirm("¿Eliminar esta geocerca?")) return;
    const { error } = await supabase.from("geofences").delete().eq("id", id);
    if (error) alert("Error eliminando geocerca"); else setItems((p) => p.filter((x) => x.id !== id));
  };

  if (loading) return <div>Cargando...</div>;

  return (
    <div>
      <h2>Geocercas</h2>
      {items.length === 0 ? (
        <p>No hay geocercas. <Link to="/nueva">Crea una</Link>.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>Nombre</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>Creada</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {items.map((g) => (
              <tr key={g.id}>
                <td style={{ padding: "6px 4px" }}>{g.name}</td>
                <td style={{ padding: "6px 4px" }}>{new Date(g.created_at).toLocaleString()}</td>
                <td style={{ padding: "6px 4px", display: "flex", gap: 8 }}>
                  <button onClick={() => navigate(`/geocercas/${g.id}`)}>Ver</button>
                  <button onClick={() => downloadJSON(`${g.name || "geocerca"}.geojson`, g.geojson)}>Exportar GeoJSON</button>
                  <button onClick={() => handleDelete(g.id)} style={{ color: "#b91c1c" }}>Eliminar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
