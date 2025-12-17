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

export default function AdminsPage() {
  // 🔑 CAMBIO CLAVE: usamos ROOT OWNER global, no role por organización
  const { currentOrg, user, isRootOwner } = useAuth();

  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingAction, setLoadingAction] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("admin");

  // ===========================================================
  // Cargar administradores (SOLO ROOT OWNER)
  // ===========================================================
  useEffect(() => {
    if (!isRootOwner) {
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
  }, [currentOrg?.id, isRootOwner]);

  // ===========================================================
  // Refresh manual
  // ===========================================================
  const handleRefresh = async () => {
    if (!currentOrg?.id || !isRootOwner) return;

    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    const { data, error: fetchError } = await listAdmins(currentOrg.id);

    if (fetchError) {
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

    if (!isRootOwner) return;

    const email = inviteEmail.trim();
    setError(null);
    setSuccessMessage(null);

    if (!email || !email.includes("@")) {
      setError("Ingresa un correo electrónico válido.");
      return;
    }

    setLoadingAction(true);

    try {
      let response;

      if (inviteRole === "admin") {
        response = await inviteAdmin(currentOrg.id, {
          email,
          role: "ADMIN",
        });
      }

      if (inviteRole === "owner") {
        response = await inviteIndependentOwner({
          email,
          full_name: null,
        });
      }

      const { error: fnError, data } = response || {};

      if (fnError) {
        setError(fnError.message || "Error al enviar la invitación.");
        return;
      }

      if (data && data.ok === false) {
        setError(data.error ?? "La invitación no pudo ser enviada.");
        return;
      }

      setInviteEmail("");
      setSuccessMessage(`La invitación fue enviada a ${email}.`);
    } catch (err) {
      console.error("[AdminsPage] excepción:", err);
      setError("Error inesperado al enviar la invitación.");
    } finally {
      setLoadingAction(false);
    }
  };

  // ===========================================================
  // DELETE / EDIT
  // ===========================================================
  const handleDelete = async (adm) => {
    if (!currentOrg?.id || !isRootOwner) return;
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

  // ===========================================================
  // UI – BLOQUEO DEFINITIVO
  // ===========================================================
  if (!isRootOwner) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <h1 className="text-xl font-semibold text-slate-900 mb-2">
          Administradores
        </h1>
        <p className="text-sm text-slate-600">
          Este módulo es de uso exclusivo del propietario de la aplicación.
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
          Organización: <b>{currentOrg?.name}</b>
        </p>
        <p className="text-xs text-slate-500 mt-1">
          Usuario: <span className="font-mono">{user?.email}</span>
        </p>
      </header>

      {/* INVITAR */}
      <section className="mb-8 border rounded-xl p-4 bg-white">
        <h2 className="text-sm font-semibold mb-2">
          Invitar nuevo administrador
        </h2>

        <form
          onSubmit={handleInviteSubmit}
          className="flex flex-col md:flex-row gap-3"
        >
          <input
            type="email"
            placeholder="correo@ejemplo.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            className="border rounded px-3 py-2 text-sm flex-1"
          />

          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value)}
            className="border rounded px-3 py-2 text-sm"
          >
            <option value="admin">Admin (misma org)</option>
            <option value="owner">Owner (nueva org)</option>
          </select>

          <button
            type="submit"
            disabled={loadingAction}
            className="bg-blue-600 text-white rounded px-4 py-2 text-sm"
          >
            {loadingAction ? "Procesando..." : "Invitar"}
          </button>
        </form>
      </section>

      {error && (
        <div className="bg-red-50 border border-red-300 text-red-700 p-2 rounded text-xs mb-3">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-700 p-2 rounded text-xs mb-3">
          {successMessage}
        </div>
      )}

      {/* LISTA */}
      <section className="border rounded-xl bg-white">
        <div className="flex justify-between items-center px-4 py-3 border-b">
          <h2 className="text-sm font-semibold">Administradores</h2>
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="border rounded px-3 py-1.5 text-xs"
          >
            Refrescar
          </button>
        </div>

        {loading ? (
          <p className="p-4 text-sm text-slate-500">Cargando…</p>
        ) : admins.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">
            No hay administradores.
          </p>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left">Rol</th>
                <th className="px-3 py-2 text-left">Email</th>
                <th className="px-3 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {admins.map((adm) => (
                <tr key={adm.user_id} className="border-t">
                  <td className="px-3 py-2">{adm.role}</td>
                  <td className="px-3 py-2">{adm.email}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => handleDelete(adm)}
                      className="text-red-600 border border-red-500 rounded px-2 py-1 text-xs"
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
