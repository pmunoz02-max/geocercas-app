// src/pages/AdminsPage.jsx
import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import {
  listAdmins,
  inviteAdmin,
  inviteIndependentOwner,
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
  const [successMessage, setSuccessMessage] = useState(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("admin");

  // ===========================================================
  // Cargar administradores ACTUALES de la org en sesión
  // ===========================================================
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
      setSuccessMessage(null);

      const { data, error: fetchError } = await listAdmins(currentOrg.id);

      if (fetchError) {
        console.error("[AdminsPage] listAdmins error:", fetchError);
        setError(
          fetchError.message ||
            "No se pudo cargar la lista de administradores."
        );
      } else {
        setAdmins(data || []);
      }
      setLoading(false);
    };

    fetchAdmins();
  }, [currentOrg?.id, isOwner]);

  // ===========================================================
  // Refresh manual
  // ===========================================================
  const handleRefresh = async () => {
    if (!currentOrg?.id || !isOwner) return;
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    const { data, error: fetchError } = await listAdmins(currentOrg.id);
    if (fetchError) {
      console.error("[AdminsPage] listAdmins error:", fetchError);
      setError(
        fetchError.message ||
          "No se pudo actualizar la lista de administradores."
      );
    } else {
      setAdmins(data || []);
    }
    setLoading(false);
  };

  // ===========================================================
  // INVITAR NUEVO ADMINISTRADOR
  // ===========================================================
  const handleInviteSubmit = async (e) => {
    e.preventDefault();

    const email = inviteEmail.trim();
    setError(null);
    setSuccessMessage(null);

    if (!email) {
      setError("Ingresa un correo electrónico para invitar.");
      return;
    }

    if (!email.includes("@")) {
      setError("Ingresa un correo electrónico válido.");
      return;
    }

    setLoadingAction(true);

    try {
      let response;

      // --- CASO 1: ADMIN dentro de la organización actual ---
      if (inviteRole === "admin") {
        response = await inviteAdmin(currentOrg.id, {
          email,
          role: "ADMIN",
        });
      }

      // --- CASO 2: OWNER con organización propia ---
      if (inviteRole === "owner") {
        response = await inviteIndependentOwner({
          email,
          full_name: null,
        });
      }

      const { error: fnError, data } = response || {};

      if (fnError) {
        console.error("[AdminsPage] invite fnError:", fnError);
        setError(
          fnError.message ||
            "Error al enviar la invitación. Revisa la configuración del servidor."
        );
        return;
      }

      if (data && data.ok === false) {
        setError(data.error ?? "La invitación no pudo ser enviada.");
        return;
      }

      setInviteEmail("");
      setSuccessMessage(`La invitación fue enviada al correo ${email}.`);
    } catch (err) {
      console.error("[AdminsPage] excepción en handleInviteSubmit:", err);

      let friendly = "Error inesperado al enviar la invitación.";

      const ctx = err?.context;
      if (ctx && typeof ctx === "object") {
        try {
          const maybeJson =
            typeof ctx.json === "function" ? await ctx.json() : ctx;

          if (
            maybeJson &&
            typeof maybeJson === "object" &&
            typeof maybeJson.error === "string"
          ) {
            friendly = maybeJson.error;
          }
        } catch {}
      }

      setError(friendly);
    } finally {
      setLoadingAction(false);
    }
  };

  // ===========================================================
  // DELETE / EDIT placeholders
  // ===========================================================
  const handleDelete = async (adm) => {
    if (!currentOrg?.id) return;

    if (!window.confirm("¿Eliminar este administrador?")) return;

    setLoadingAction(true);
    setError(null);
    setSuccessMessage(null);

    const { error: delErr } = await deleteAdmin(currentOrg.id, adm.user_id);
    if (delErr) {
      setError(delErr.message || "No se pudo eliminar al administrador.");
    } else {
      setAdmins((prev) => prev.filter((a) => a.user_id !== adm.user_id));
    }

    setLoadingAction(false);
  };

  const handleEdit = (adm) => {
    setError("Edición aún en construcción.");
    setSuccessMessage(null);
  };

  // ===========================================================
  // UI
  // ===========================================================
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
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">
          Administradores actuales
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Organización:{" "}
          <span className="font-medium">{currentOrg?.name}</span>.
        </p>
        <p className="text-xs text-slate-500 mt-1">
          Usuario actual: <span className="font-mono">{user?.email}</span>
        </p>
      </header>

      {/* INVITAR NUEVO ADMIN */}
      <section className="mb-8 border border-slate-200 rounded-xl p-4 bg-white">
        <h2 className="text-sm font-semibold text-slate-900 mb-2">
          Invitar nuevo administrador
        </h2>

        <p className="text-xs text-slate-500 mb-3">
          Elige si este usuario será un <b>ADMIN de esta organización</b> o un{" "}
          <b>OWNER independiente con su propia organización</b>.
        </p>

        <form
          onSubmit={handleInviteSubmit}
          className="flex flex-col md:flex-row gap-3 items-start md:items-end"
        >
          <div className="flex-1">
            <label className="block text-xs font-medium mb-1">
              Correo electrónico
            </label>
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Rol</label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="rounded-md border px-3 py-2 text-sm"
            >
              <option value="admin">Admin (misma organización)</option>
              <option value="owner">Owner (nueva organización)</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={loadingAction}
            className="rounded-md bg-blue-600 text-white px-4 py-2 text-sm"
          >
            {loadingAction ? "Procesando..." : "Enviar invitación"}
          </button>
        </form>
      </section>

      {error && (
        <div className="border border-red-300 bg-red-50 py-2 px-3 text-xs text-red-700 rounded mb-4">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="border border-emerald-300 bg-emerald-50 py-2 px-3 text-xs text-emerald-700 rounded mb-4">
          {successMessage}
        </div>
      )}

      {/* LISTA ADMINISTRADORES */}
      <section className="border border-slate-200 rounded-xl bg-white">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h2 className="text-sm font-semibold">Propietarios y administradores</h2>
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="border rounded px-3 py-1.5 text-xs"
          >
            {loading ? "Actualizando..." : "Refrescar"}
          </button>
        </div>

        {loading ? (
          <div className="p-6 text-center text-slate-500 text-sm">
            Cargando administradores...
          </div>
        ) : admins.length === 0 ? (
          <div className="p-6 text-center text-slate-500 text-sm">
            No hay administradores en esta organización.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left">Rol</th>
                  <th className="px-3 py-2 text-left">User ID</th>
                  <th className="px-3 py-2 text-left">Email</th>
                  <th className="px-3 py-2 text-left">Creado</th>
                  <th className="px-3 py-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {admins.map((adm) => {
                  const r = adm.role?.toUpperCase() ?? "—";
                  return (
                    <tr key={adm.user_id} className="border-t">
                      <td className="px-3 py-2">{r}</td>
                      <td className="px-3 py-2 font-mono">{adm.user_id}</td>
                      <td className="px-3 py-2">{adm.email ?? "—"}</td>
                      <td className="px-3 py-2">
                        {adm.created_at
                          ? new Date(adm.created_at).toLocaleString()
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => handleEdit(adm)}
                          className="text-xs border px-2 py-1 rounded mr-2"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => handleDelete(adm)}
                          className="text-xs border border-red-500 text-red-600 px-2 py-1 rounded"
                        >
                          Eliminar
                        </button>
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
