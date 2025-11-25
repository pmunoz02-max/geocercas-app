// src/pages/Organizations.jsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { createOrganization, listMyOrganizations } from "@/services/orgs";
import { supabase } from "@/lib/supabaseClient";

export default function Organizations() {
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const rows = await listMyOrganizations(); // devuelve org_id, org_name, role, slug, created_at
      setOrgs(rows || []);
    } catch (err) {
      console.error(err);
      alert("Error cargando organizaciones: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onCreate = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      alert("Ingresa un nombre");
      return;
    }
    try {
      await createOrganization(name.trim(), slug.trim() || null);
      setName("");
      setSlug("");
      await load();
    } catch (err) {
      console.error(err);
      alert("No se pudo crear la organización: " + err.message);
    }
  };

  const onLogout = async () => {
    await supabase.auth.signOut();
    location.reload();
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Mis Organizaciones</h1>
        <button
          onClick={onLogout}
          className="px-3 py-2 rounded-xl shadow border hover:bg-gray-50"
        >
          Cerrar sesión
        </button>
      </div>

      <form
        onSubmit={onCreate}
        className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 border rounded-2xl shadow"
      >
        <input
          className="border rounded-xl px-3 py-2"
          placeholder="Nombre de la organización (ej. Finca Norte)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="border rounded-xl px-3 py-2"
          placeholder="slug (opcional, ej. finca-norte)"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
        />
        <button
          type="submit"
          className="rounded-2xl px-4 py-2 shadow bg-black text-white hover:opacity-90"
        >
          Crear
        </button>
      </form>

      {loading ? (
        <div className="p-4">Cargando…</div>
      ) : orgs.length === 0 ? (
        <div className="p-4 border rounded-2xl">No tienes organizaciones aún.</div>
      ) : (
        <div className="grid gap-3">
          {orgs.map((o) => {
            // Validación defensiva: necesitamos un UUID real
            const id = o.org_id || o.id; // por si la vista cambia a id
            const name = o.org_name || o.name || "(sin nombre)";

            return (
              <div
                key={`${id}-${o.user_id ?? ""}`}
                className="border rounded-2xl p-4 flex items-center justify-between"
              >
                <div>
                  <div className="text-lg font-semibold">{name}</div>
                  <div className="text-sm text-gray-600">
                    Rol: <span className="font-medium">{o.role}</span>
                    {o.slug ? ` · slug: ${o.slug}` : ""}
                  </div>
                  <div className="text-xs text-gray-400 mt-1 break-all">
                    Org ID: {id}
                  </div>
                </div>

                <div className="flex gap-2">
                  {/* ✅ Enlaces con el UUID real; NUNCA "ID" fijo */}
                  <Link
                    to={`/orgs/${id}/members`}
                    className="px-3 py-2 rounded-xl shadow border hover:bg-gray-50"
                  >
                    Ver miembros
                  </Link>
                  <Link
                    to={`/orgs/${id}/invitations`}
                    className="px-3 py-2 rounded-xl shadow border hover:bg-gray-50"
                  >
                    Invitaciones
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
