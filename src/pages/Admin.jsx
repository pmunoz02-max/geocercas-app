// src/pages/Admin.jsx
import { useEffect, useState } from "react";
// Si NO usas alias "@", cambia la siguiente línea a: import { ... } from "../services/admin";
import {
  createOrganization,
  listMyOrganizations,
  getMyProfile,
  adminAssignRoleOrg, // lo dejamos aunque no se use aún
  sendMagicLink,
} from "@/services/admin";

export default function Admin() {
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [orgName, setOrgName] = useState("");
  const [error, setError] = useState("");
  const [me, setMe] = useState(null);
  const [inviteEmail, setInviteEmail] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [profile, organizations] = await Promise.all([
        getMyProfile().catch(() => null),
        listMyOrganizations(),
      ]);
      setMe(profile);
      setOrgs(organizations);
    } catch (e) {
      const msg = (e && e.message) ? e.message : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function onCreateOrg(e) {
    e.preventDefault();
    setError("");
    try {
      if (!orgName.trim()) return;
      const org = await createOrganization(orgName.trim());
      setOrgName("");
      setOrgs((prev) => [org, ...prev]);
    } catch (e) {
      const msg = (e && e.message) ? e.message : String(e);
      setError(msg);
    }
  }

  async function onSendMagicLink(e) {
    e.preventDefault();
    setError("");
    try {
      if (!inviteEmail.trim()) return;
      await sendMagicLink(inviteEmail.trim());
      setInviteEmail("");
      alert("Enlace enviado.");
    } catch (e) {
      const msg = (e && e.message) ? e.message : String(e);
      setError(msg);
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-4">
      <h1 className="text-2xl font-semibold mb-4">Admin</h1>

      {error && (
        <div className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="mb-6 rounded-lg border p-4">
        <h2 className="mb-3 text-lg font-medium">Mi perfil</h2>
        {me ? (
          <div className="text-sm">
            <div><b>ID:</b> {me.id}</div>
            <div><b>Email:</b> {me.email ?? "—"}</div>
            <div><b>Nombre:</b> {me.full_name ?? "—"}</div>
            <div><b>Rol:</b> {me.role_id ?? "—"}</div>
            <div><b>Org:</b> {me.org_id ?? "—"}</div>
          </div>
        ) : (
          <div className="text-sm text-gray-500">Sin datos de perfil.</div>
        )}
      </section>

      <section className="mb-6 rounded-lg border p-4">
        <h2 className="mb-3 text-lg font-medium">Crear Organización</h2>
        <form onSubmit={onCreateOrg} className="flex gap-2">
          <input
            type="text"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            placeholder="Nombre de la organización"
            className="w-full rounded border px-3 py-2"
          />
          <button
            type="submit"
            className="rounded bg-black px-4 py-2 text-white"
          >
            Crear
          </button>
        </form>
      </section>

      <section className="mb-6 rounded-lg border p-4">
        <h2 className="mb-3 text-lg font-medium">Mis Organizaciones</h2>
        {loading ? (
          <div className="text-sm text-gray-500">Cargando…</div>
        ) : orgs.length === 0 ? (
          <div className="text-sm text-gray-500">No hay organizaciones.</div>
        ) : (
          <ul className="space-y-2">
            {orgs.map((o) => (
              <li key={o.id} className="rounded border p-3">
                <div className="font-medium">{o.name}</div>
                <div className="text-xs text-gray-600">ID: {o.id}</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-6 rounded-lg border p-4">
        <h2 className="mb-3 text-lg font-medium">Invitar Tracker (Magic Link)</h2>
        <form onSubmit={onSendMagicLink} className="flex gap-2">
          <input
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="tracker@correo.com"
            className="w-full rounded border px-3 py-2"
          />
          <button type="submit" className="rounded bg-black px-4 py-2 text-white">
            Enviar
          </button>
        </form>
        <p className="mt-2 text-xs text-gray-500">
          Este botón usa la Edge Function <code>send-magic-link</code>.
        </p>
      </section>
    </div>
  );
}
