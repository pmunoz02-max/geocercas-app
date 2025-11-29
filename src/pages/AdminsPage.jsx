// src/pages/AdminsPage.jsx
// Página de administración de propietarios y administradores.
// Solo visible para el OWNER de la organización actual.
//
// Esta versión:
//  - Lista admins leyendo user_roles_view (owner/admin).
//  - Permite registrar invitaciones en org_invites.
//  - Envía un Magic Link real al correo invitado con signInWithOtp.
//  - Aún NO crea la membresía automática (Paso 2).

import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import {
  listAdmins,
  inviteAdmin,
  updateAdmin,
  deleteAdmin,
} from "../lib/adminsApi";
import { supabase } from "../supabaseClient";

export default function AdminsPage() {
  const { currentOrg, isOwner, user } = useAuth();

  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingAction, setLoadingAction] = useState(false);
  const [error, setError] = useState(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("admin"); // único rol invitado por ahora

  // Cargar lista de administradores
  useEffect(() => {
    if (!isOwner) {
      setLoading(false);
      return;
    }
    if (!currentOrg?.id) {
      setError("No se encontró la organización actual.");
      setLoading(false);
      return;
    }

    const fetchAdmins = async () => {
      setLoading(true);
      setError(null);
      const orgId = currentOrg.id;

      const { data, error: fetchError } = await listAdmins(orgId);

      if (fetchError) {
        console.error("[AdminsPage] listAdmins error:", fetchError);
        setError(
          fetchError.message || "No se pudo cargar la lista de administradores."
        );
      } else {
        setAdmins(data || []);
      }
      setLoading(false);
    };

    fetchAdmins();
  }, [currentOrg?.id, isOwner]);

  const handleRefresh = async () => {
    if (!currentOrg?.id || !isOwner) return;
    setLoading(true);
    setError(null);
    const { data, error: fetchError } = await listAdmins(currentOrg.id);
    if (fetchError) {
      console.error("[AdminsPage] listAdmins error:", fetchError);
      setError(
        fetchError.message || "No se pudo actualizar la lista de administradores."
      );
    } else {
      setAdmins(data || []);
    }
    setLoading(false);
  };

  // Invitación de admin: inserta en org_invites + envía Magic Link real
  const handleInviteSubmit = async (e) => {
    e.preventDefault();
    if (!currentOrg?.id) return;

    const email = inviteEmail.trim();

    if (!email) {
      setError("Ingresa un correo electrónico para invitar.");
      return;
    }

    setLoadingAction(true);
    setError(null);

    // 1) Registrar invitación en org_invites
    const { data, error: apiError } = await inviteAdmin(currentOrg.id, {
      email,
      role: inviteRole,
      invitedBy: user?.id,
    });

    if (apiError) {
      console.error("[AdminsPage] inviteAdmin error:", apiError);
      setError(
        apiError.message ||
          "No se pudo registrar la invitación. Revisa los permisos del owner."
      );
      setLoadingAction(false);
      return;
    }

    // 2) Enviar Magic Link real al correo invitado
    const redirectUrl = `${window.location.origin}/auth/callback`;

    const { error: magicError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectUrl,
      },
    });

    if (magicError) {
      console.error("[AdminsPage] Magic Link error:", magicError);
      setError(
        magicError.message ||
          "La invitación se registró, pero hubo un problema al enviar el Magic Link."
      );
      setLoadingAction(false);
      return;
    }

    // Si todo fue bien:
    setInviteEmail("");
    // En esta fase la invitación no cambia la lista de admins inmediatamente.
    // Más adelante (Paso 2) cuando el invitado acepte, lo veremos reflejado.
    setLoadingAction(false);
  };

  const handleDelete = async (admin) => {
    if (!currentOrg?.id) return;
    if (!window.confirm("¿Eliminar este administrador de la organización?")) {
      return;
    }

    setLoadingAction(true);
    setError(null);

    const { error: deleteError } = await deleteAdmin(
      currentOrg.id,
      admin.user_id
    );

    if (deleteError) {
      console.error("[AdminsPage] deleteAdmin error:", deleteError);
      setError(
        deleteError.message ||
          "No se pudo eliminar al administrador (función en construcción)."
      );
    } else {
      setAdmins((prev) => prev.filter((a) => a.user_id !== admin.user_id));
    }

    setLoadingAction(false);
  };

  const handleEdit = async (admin) => {
    console.log("[AdminsPage] editar admin (pendiente de implementación)", admin);
    setError(
      "Edición de administradores aún en construcción. Solo lectura por ahora."
    );
  };

  // --- RENDER ---

  if (!isOwner) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <h1 className="text-xl font-semibold text-slate-900 mb-2">
          Administradores
        </h1>
        <p className="text-sm text-slate-600">
          Este módulo es exclusivo para el propietario de la organización.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Encabezado */}
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">
          Administradores actuales
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Organización:{" "}
          <span className="font-medium">
            {currentOrg?.name || "Sin nombre"}
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
          Ingresa el correo electrónico de la persona a la que quieres invitar
          como administradora de esta organización. Se enviará un Magic Link
          real al email utilizando Supabase Auth.
        </p>

        <form
          onSubmit={handleInviteSubmit}
          className="flex flex-col md:flex-row gap-3 items-start md:items-end"
        >
          <div className="flex-1 w-full">
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Correo electrónico
            </label>
            <input
              type="email"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="admin@ejemplo.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Rol
            </label>
            <select
              className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
            >
              <option value="admin">Admin</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={loadingAction}
            className="inline-flex items-center justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loadingAction ? "Procesando..." : "Enviar invitación"}
          </button>
        </form>

        <p className="mt-2 text-xs text-amber-600">
          Nota: la lógica de creación automática de la membresía (agregar a la
          organización con rol admin) se implementará en el siguiente paso. Por
          ahora, usa este módulo principalmente para revisar quiénes tienen rol
          de owner/admin y para enviar invitaciones reales por correo.
        </p>
      </section>

      {/* Mensajes de error */}
      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* Tabla de administradores */}
      <section className="border border-slate-200 rounded-xl bg-white">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900">
            Lista de propietarios y administradores
          </h2>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={loading}
            className="inline-flex items-center rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? "Actualizando..." : "Refrescar"}
          </button>
        </div>

        {loading ? (
          <div className="px-4 py-8 text-center text-sm text-slate-500">
            Cargando administradores...
          </div>
        ) : admins.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-slate-500">
            No se encontraron administradores para esta organización.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs md:text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-slate-500">
                    Rol
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500">
                    Usuario
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500">
                    Email
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500">
                    Nombre
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500">
                    Creado
                  </th>
                  <th className="px-3 py-2 text-right font-medium text-slate-500">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {admins.map((adm) => {
                  const role =
                    adm.role ||
                    adm.role_name ||
                    "";
                  const roleLabel =
                    role === "owner"
                      ? "Owner"
                      : role === "admin"
                      ? "Admin"
                      : role || "—";

                  return (
                    <tr key={adm.user_id}>
                      <td className="px-3 py-2 align-middle">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            role === "owner"
                              ? "bg-purple-50 text-purple-700"
                              : role === "admin"
                              ? "bg-blue-50 text-blue-700"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {roleLabel}
                        </span>
                      </td>
                      <td className="px-3 py-2 align-middle font-mono text-[11px] md:text-xs text-slate-700">
                        {adm.user_id}
                      </td>
                      <td className="px-3 py-2 align-middle text-slate-700">
                        {adm.email || "—"}
                      </td>
                      <td className="px-3 py-2 align-middle text-slate-700">
                        {adm.full_name || "—"}
                      </td>
                      <td className="px-3 py-2 align-middle text-slate-500">
                        {adm.created_at
                          ? new Date(adm.created_at).toLocaleString()
                          : "—"}
                      </td>
                      <td className="px-3 py-2 align-middle text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleEdit(adm)}
                            className="inline-flex items-center rounded-md border border-slate-300 px-2 py-1 text-[11px] md:text-xs text-slate-700 hover:bg-slate-50"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(adm)}
                            className="inline-flex items-center rounded-md border border-red-500 px-2 py-1 text-[11px] md:text-xs text-red-600 hover:bg-red-50"
                          >
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

