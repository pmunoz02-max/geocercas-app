// src/pages/orgs/OrgsIndex.jsx
import { Link } from "react-router-dom";

export default function OrgsIndex() {
  return (
    <div style={{ padding: 16 }}>
      <h2>Mis Organizaciones</h2>

      {/* Aquí luego listaremos desde Supabase */}
      <p>No tienes organizaciones aún.</p>

      <Link to="/orgs/new">
        <button>Crear nueva organización</button>
      </Link>
    </div>
  );
}
