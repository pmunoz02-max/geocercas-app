// src/pages/orgs/NewOrg.jsx
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";

export default function NewOrg() {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const navigate = useNavigate();

  const onSubmit = (e) => {
    e.preventDefault();
    // TODO: aquí luego llamamos a Supabase (RPC create_organization o similar)
    console.log("Crear org:", { name, slug });
    navigate("/orgs");
  };

  return (
    <div style={{ padding: 16 }}>
      <h2>Nueva organización</h2>
      <form onSubmit={onSubmit} style={{ maxWidth: 420 }}>
        <label>Nombre</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej. Finca Principal"
          required
          style={{ display: "block", width: "100%", margin: "8px 0 16px" }}
        />

        <label>Slug (opcional)</label>
        <input
          type="text"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="ej. mi-finca-principal"
          style={{ display: "block", width: "100%", margin: "8px 0 16px" }}
        />

        <button type="submit">Crear</button>
        <Link to="/orgs" style={{ marginLeft: 12 }}>
          <button type="button">Cancelar</button>
        </Link>
      </form>
    </div>
  );
}
