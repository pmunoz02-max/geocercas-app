// src/pages/Invitations.jsx
import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { inviteMember, listInvitations, cancelInvitation } from "@/services/invitations";
import { listMyOrganizations } from "@/services/orgs";

const ROLE_OPTIONS = ["owner", "admin", "tracker", "viewer"];

export default function Invitations() {
  const { orgId } = useParams();
  const [myOrg, setMyOrg] = useState(null);
  const [invites, setInvites] = useState([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("viewer");
  const [loading, setLoading] = useState(true);

  const canManage = myOrg && (myOrg.role === "owner" || myOrg.role === "admin");

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  const load = async () => {
    setLoading(true);
    try {
      const my = await listMyOrganizations();
      const found = (my || []).find((m) => m.org_id === orgId) || null;
      setMyOrg(found);

      const rows = await listInvitations(orgId);
      setInvites(rows);
    } catch (e) {
      console.error(e);
      alert("Error cargando invitaciones: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (orgId) load();
  }, [orgId]);

  const onInvite = async (e) => {
    e.preventDefault();
    if (!canManage) return;
    if (!email.includes("@")) {
      alert("Email inválido");
      return;
    }
    try {
      await inviteMember(orgId, email.trim(), role);
      setEmail("");
      setRole("viewer");
      await load();
    } catch (e) {
      console.error(e);
      alert("No se pudo invitar: " + e.message);
    }
  };

  const onCancel = async (id) => {
    if (!confirm("¿Cancelar esta invitación?")) return;
    try {
      await cancelInvitation(id);
      await load();
    } catch (e) {
      console.error(e);
      alert("No se pudo cancelar: " + e.message);
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to={`/orgs/${orgId}/members`} className="px-3 py-2 rounded-xl shadow border hover:bg-gray-50">
            ← Miembros
          </Link>
          <h1 className="text-2xl font-bold">Invitaciones</h1>
        </div>
      </div>

      {myOrg ? (
        <div className="text-sm text-gray-700">
          Organización: <span className="font-semibold">{myOrg.org_name}</span> · Tu rol:{" "}
          <span className="font-semibold">{myOrg.role}</span>
        </div>
      ) : (
        <div className="text-sm text-red-600">
          No perteneces a esta organización o no tienes permisos.
        </div>
      )}

      {canManage && (
        <form onSubmit={onInvite} className="grid grid-cols-1 md:grid-cols-4 gap-3 p-4 border rounded-2xl shadow">
          <input
            className="border rounded-xl px-3 py-2"
            placeholder="email@dominio.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <select className="border rounded-xl px-3 py-2" value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <button type="submit" className="rounded-2xl px-4 py-2 shadow bg-black text-white hover:opacity-90">
            Invitar
          </button>
          <div className="text-sm text-gray-500 self-center">
            Se genera un link único para aceptar. Puedes copiarlo y enviarlo por tu propio correo/WhatsApp.
          </div>
        </form>
      )}

      {loading ? (
        <div className="p-4">Cargando…</div>
      ) : (
        <div className="border rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-3">Email</th>
                <th className="text-left p-3">Rol</th>
                <th className="text-left p-3">Estado</th>
                <th className="text-left p-3">Link</th>
                <th className="text-left p-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {invites.map((i) => (
                <tr key={i.id} className="border-t">
                  <td className="p-3">{i.email}</td>
                  <td className="p-3">{i.role}</td>
                  <td className="p-3">{i.status}</td>
                  <td className="p-3">
                    {i.status === "pending" ? (
                      <div className="flex gap-2 items-center">
                        <input
                          readOnly
                          className="border rounded px-2 py-1 w-full"
                          value={`${baseUrl}/accept-invite/${i.token}`}
                        />
                      </div>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="p-3">
                    {i.status === "pending" ? (
                      <button
                        onClick={() => onCancel(i.id)}
                        className="px-3 py-1 rounded-lg border shadow hover:bg-gray-50"
                      >
                        Cancelar
                      </button>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {invites.length === 0 && (
                <tr>
                  <td className="p-4 text-center text-gray-600" colSpan={5}>
                    No hay invitaciones.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
