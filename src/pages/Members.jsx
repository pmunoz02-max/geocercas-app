// src/pages/Members.jsx
import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { listMembers, listMyOrganizations, setMemberRole } from "@/services/orgs";
import { supabase } from "@/lib/supabaseClient";

const ROLE_OPTIONS = ["owner", "admin", "tracker", "viewer"];

export default function Members() {
  const { orgId } = useParams();
  const [org, setOrg] = useState(null);           // la membresía del usuario actual en esta org
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [changing, setChanging] = useState(null); // user_id en proceso

  const myRole = useMemo(() => org?.role ?? "viewer", [org]);

  const canManage = myRole === "owner" || myRole === "admin";

  const load = async () => {
    setLoading(true);
    try {
      // Cargar mi membresía para saber mi rol
      const mine = await listMyOrganizations();
      const current = (mine || []).find((m) => m.org_id === orgId) || null;
      setOrg(current);

      // Cargar lista de miembros
      const rows = await listMembers(orgId);
      // Normalizar: vendrá con join a profiles (puede venir null si no hay perfil)
      const normalized = (rows || []).map((r) => ({
        user_id: r.user_id,
        org_id: r.org_id,
        role: r.role,
        created_at: r.created_at,
        full_name: r.profiles?.full_name || "(sin nombre)",
        avatar_url: r.profiles?.avatar_url || null,
      }));
      setMembers(normalized);
    } catch (err) {
      console.error(err);
      alert("Error cargando miembros: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (orgId) load();
  }, [orgId]);

  const updateRole = async (userId, role) => {
    try {
      setChanging(userId);
      await setMemberRole(orgId, userId, role);
      await load();
    } catch (err) {
      console.error(err);
      alert("No se pudo cambiar el rol: " + err.message);
    } finally {
      setChanging(null);
    }
  };

  const onLogout = async () => {
    await supabase.auth.signOut();
    location.assign("/");
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/orgs" className="px-3 py-2 rounded-xl shadow border hover:bg-gray-50">
            ← Mis Organizaciones
          </Link>
          <h1 className="text-2xl font-bold">Miembros</h1>
        </div>
        <button
          onClick={onLogout}
          className="px-3 py-2 rounded-xl shadow border hover:bg-gray-50"
        >
          Cerrar sesión
        </button>
      </div>

      {org ? (
        <div className="text-sm text-gray-700">
          Organización: <span className="font-semibold">{org.org_name}</span> · Tu rol:{" "}
          <span className="font-semibold">{org.role}</span>
        </div>
      ) : (
        <div className="text-sm text-red-600">
          No perteneces a esta organización o no tienes permisos.
        </div>
      )}

      {loading ? (
        <div className="p-4">Cargando…</div>
      ) : (
        <div className="border rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-3">Usuario</th>
                <th className="text-left p-3">Rol</th>
                <th className="text-left p-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.user_id} className="border-t">
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      {m.avatar_url ? (
                        <img
                          src={m.avatar_url}
                          alt="avatar"
                          className="w-8 h-8 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gray-200" />
                      )}
                      <div>
                        <div className="font-medium">{m.full_name}</div>
                        <div className="text-xs text-gray-500">{m.user_id}</div>
                      </div>
                    </div>
                  </td>
                  <td className="p-3">
                    <span className="px-2 py-1 rounded-lg border">{m.role}</span>
                  </td>
                  <td className="p-3">
                    {canManage ? (
                      <select
                        disabled={changing === m.user_id}
                        value={m.role}
                        onChange={(e) => updateRole(m.user_id, e.target.value)}
                        className="border rounded-xl px-2 py-1"
                      >
                        {ROLE_OPTIONS.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-gray-400">Sin permisos</span>
                    )}
                  </td>
                </tr>
              ))}
              {members.length === 0 && (
                <tr>
                  <td className="p-4 text-center text-gray-600" colSpan={3}>
                    No hay miembros registrados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="text-xs text-gray-500">
        * Cambiar roles requiere ser <span className="font-semibold">owner</span> o{" "}
        <span className="font-semibold">admin</span>. Los permisos de escritura están protegidos por RLS.
      </div>
    </div>
  );
}
