import React from "react";
import { useAuth } from "@/context/auth.js";

export default function Account() {
  const auth = useAuth();
  const {
    user,
    authenticated,
    loading,
    ready,
    currentOrgId,
    role,
    signOut,
    logout,
  } = auth || {};

  const handleSignOut = signOut || logout;

  if (loading || !ready) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm text-slate-700">
          Cargando cuenta...
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-10 space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-slate-900">Cuenta</h1>
          <p className="mt-3 text-slate-700">No hay sesión activa</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Cuenta</h1>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Estado de sesión</h2>
        <p className="mt-2 text-slate-700">
          authenticated: <span className="font-medium">{authenticated ? "true" : "false"}</span>
        </p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Usuario</h2>
        <p className="mt-2 text-slate-700">
          email: <span className="font-medium">{user?.email || "-"}</span>
        </p>
        <p className="mt-1 text-slate-700 break-all">
          id: <span className="font-mono">{user?.id || "-"}</span>
        </p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Organización actual</h2>
        <p className="mt-2 text-slate-700 break-all">
          currentOrgId: <span className="font-mono">{currentOrgId || "-"}</span>
        </p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Rol</h2>
        <p className="mt-2 text-slate-700">
          role: <span className="font-medium">{role || "-"}</span>
        </p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <button
          type="button"
          onClick={() => handleSignOut?.()}
          disabled={!handleSignOut}
          className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Cerrar sesión
        </button>

        {!handleSignOut ? (
          <p className="mt-3 text-sm text-amber-700">
            {/* TODO: Implementar acción de cierre de sesión en el contexto de auth. */}
            No hay acción de cierre de sesión disponible en el contexto actual.
          </p>
        ) : null}
      </section>
    </div>
  );
}
