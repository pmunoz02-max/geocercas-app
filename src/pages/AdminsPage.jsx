// src/pages/AdminsPage.jsx
import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import {
  listAdmins,
  inviteAdmin,
  updateAdmin,
  deleteAdmin,
} from "../lib/adminsApi";

export default function AdminsPage() {
  const { currentOrg, isOwner, user } = useAuth();
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingAction, setLoadingAction] = useState(false);
  const [error, setError] = useState(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");

  // "Owner efectivo": owner por rol o por email especial
  const isOwnerLike = isOwner || user?.email === "fenice.ecuador@gmail.com";

  // Solo owner-like puede ver este módulo
  if (!isOwnerLike) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <h1 className="text-xl font-semibold text-slate-900 mb-2">
          Administradores
        </h1>
        <p className="text-sm text-slate-600">
          Este módulo es exclusivo para el owner de la organización.
        </p>
      </div>
    );
  }

  const orgId = currentOrg?.id || null;

  useEffect(() => {
    const load = async () => {
      if (!orgId) {
        setAdmins([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      const { data, error: err } = await listAdmins(orgId);
      if (err) {
        console.error("[AdminsPage] listAdmins error:", err);
        setError(err.message || "Error al cargar administradores.");
      } else {
        setAdmins(data || []);
      }
      setLoading(false);
    };

    load();
  }, [orgId]);

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    if (!orgId) {
      alert("No hay organización actual seleccionada.");
      return;
    }

    setLoadingAction(true);
    const { error: err } = await inviteAdmin(orgId, {
      email: inviteEmail.trim(),
      full_name: inviteName.trim() || null,
    });

    if (err) {
      alert(
        err.message ||
          "Funcionalidad de invitación aún en construcción. (inviteAdmin)"
      );
    } else {
      setInviteEmail("");
      setInviteName("");
      // En una versión completa recargaríamos la lista:
      // const { data } = await listAdmins(orgId);
      // setAdmins(data || []);
    }

    setLoadingAction(false);
  };

  const handleDelete = async (userId) => {
    if (!orgId) return;
    const confirm = window.confirm(
      "¿Seguro que quieres eliminar a este administrador de la organización?"
    );
    if (!confirm) return;

    setLoadingAction(true);
    const { error: err } = await deleteAdmin(orgId, userId);
    if (err) {
      alert(
        err.message ||
          "Funcionalidad de eliminación aún en construcción. (deleteAdmin)"
      );
    } else {
      // En versión completa refrescaríamos la lista:
      // setAdmins((prev) => prev.filter((a) => a.user_id !== userId));
    }
    setLoadingAction(false);
  };

  return (
    <div className="max-w-5xl mx-auto p-4">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">
          Administradores
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Gestiona los administradores de la organización{" "}
          <span className="font-medium">
            {currentOrg?.name || "(sin nombre)"}
          </span>
          . Este módulo es exclusivo para el owner.
        </p>
        <p className="text-xs text-slate-500 mt-1">
          Usuario actual: <span className="font-mono">{user?.email}</span>
        </p>
      </header>

      {/* Formulario de invitación */}
      <section className="mb-8 border border-slate-200 rounded-xl p-4 bg-white">
        <h2 className="text-sm font-semibold text-slate-900 mb-2">
          Invitar nuevo administrador
        </h2>
        <p className="text-xs text-slate-500 mb-3">
          En la versión completa este formulario enviará un Magic Link al correo
          indicado y creará la membresía con rol <code>admin</code> en la
          organización actual.
        </p>

        <form
          onSubmit={handleInvite}
          className="grid gap-3 md:grid-cols-[2fr,2fr,auto]"
        >
          <div className="flex flex-col">
            <label
              htmlFor="inviteEmail"
              className="text-xs font-medium text-slate-700 mb-1"
            >
              Correo electrónico
            </label>
            <input
              id="inviteEmail"
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
              placeholder="admin@empresa.com"
            />
          </div>

          <div className="flex flex-col">
            <label
              htmlFor="inviteName"
              className="text-xs font-medium text-slate-700 mb-1"
            >
              Nombre (opcional)
            </label>
            <input
              id="inviteName"
              type="text"
              value={inviteName}
              onChange={(e) => setInviteName(e.target.value)}
              className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
              placeholder="Nombre del administrador"
            />
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              disabled={loadingAction}
              className="w-full md:w-auto inline-flex items-center justify-center px-3 py-2 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {loadingAction ? "Enviando..." : "Invitar admin"}
            </button>
          </div>
        </form>
      </section>

      {/* Lista de admins */}
      <section className="border border-slate-200 rounded-xl bg-white">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">
            Administradores actuales
          </h2>
          {loading && (
            <span className="text-xs text-slate-500">Cargando...</span>
          )}
        </div>

        {error && (
          <div className="px-4 py-2 text-xs text-red-600 border-b border-red-200 bg-red-50">
            {error}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-xs text-slate-500 uppercase">
                <th className="px-4 py-2 text-left font-medium">Nombre</th>
                <th className="px-4 py-2 text-left font-medium">Email</th>
                <th className="px-4 py-2 text-left font-medium">Rol</th>
                <th className="px-4 py-2 text-left font-medium">
                  Fecha de alta
                </th>
                <th className="px-4 py-2 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {!loading && admins.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-6 text-center text-sm text-slate-500"
                  >
                    No hay administradores registrados para esta organización.
                  </td>
                </tr>
              )}

              {admins.map((adm) => (
                <tr key={`${adm.org_id}-${adm.user_id}`} className="border-t">
                  <td className="px-4 py-2">
                    <div className="flex flex-col">
                      <span className="font-medium text-slate-900">
                        {adm.full_name || adm.email || "(sin nombre)"}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-slate-700">
                    {adm.email || "—"}
                  </td>
                  <td className="px-4 py-2">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                      {adm.role || "—"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-slate-500 text-xs">
                    {adm.created_at
                      ? new Date(adm.created_at).toLocaleString()
                      : "—"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => handleDelete(adm.user_id)}
                      className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-md border border-red-500 text-red-600 hover:bg-red-50"
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
