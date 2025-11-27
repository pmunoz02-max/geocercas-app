// src/pages/Inicio.jsx
import React, { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/supabaseClient";

export default function Inicio() {
  const {
    user,
    profile,
    currentOrg,
    role,        // nuevo AuthContext
    currentRole, // compatibilidad con AuthContext viejo
    loading,
  } = useAuth();

  const navigate = useNavigate();

  // Rol efectivo: primero el global (role), si no existe usa currentRole (legacy)
  const effectiveRole = role || currentRole || "tracker";

  // Nombre y correo desde profile si existe; si no, derivado de user
  const displayName =
    profile?.full_name ||
    profile?.name ||
    user?.user_metadata?.full_name ||
    (user?.email ? user.email.split("@")[0] : "Usuario");

  const displayEmail = profile?.email || user?.email || "";

  // Nombre de organización: soporta name (modelo viejo) o org_name (modelo nuevo)
  const orgName =
    currentOrg?.name || currentOrg?.org_name || "Sin organización seleccionada";

  // Redirecciones básicas: sin sesión → /login, con sesión pero sin org → /seleccionar-organizacion
  useEffect(() => {
    if (loading) return;

    if (!user) {
      navigate("/login", { replace: true });
      return;
    }

    if (!currentOrg) {
      navigate("/seleccionar-organizacion", { replace: true });
    }
  }, [loading, user, currentOrg, navigate]);

  async function handleLogout() {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error("[Inicio] Error al cerrar sesión:", err);
    } finally {
      navigate("/login", { replace: true });
    }
  }

  // Mientras carga contexto, mostramos un pequeño “splash”
  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <div className="h-10 w-10 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
          <p className="text-slate-500 text-sm">
            Cargando tu espacio de trabajo…
          </p>
        </div>
      </div>
    );
  }

  // Caso borde: si aún no hay user (mientras redirige), no pintamos nada
  if (!user) return null;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      {/* Encabezado principal */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white font-bold text-xl">
            G
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-800">
              App Geocercas
            </h1>
            <p className="text-slate-600 text-sm md:text-base">
              Dashboard de control de personal y geocercas en tiempo real.
            </p>
          </div>
        </div>

        <div className="flex flex-col items-start md:items-end gap-1 text-sm">
          <span className="px-2.5 py-1 rounded-full bg-slate-800 text-white text-xs uppercase tracking-wide">
            {effectiveRole}
          </span>
          <span className="text-slate-700 font-medium">{displayName}</span>
          <span className="text-slate-500">{displayEmail}</span>
          <span className="text-slate-500 text-xs">
            Organización: <span className="font-semibold">{orgName}</span>
          </span>
        </div>
      </div>

      {/* Tarjetas principales */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link
          to="/personal"
          className="group bg-white shadow-sm rounded-2xl p-4 border border-slate-100 hover:border-emerald-500 hover:shadow-md transition"
        >
          <h2 className="font-semibold text-slate-800 mb-1">Personal</h2>
          <p className="text-sm text-slate-600">
            Gestiona trabajadores, datos de contacto y estados.
          </p>
          <span className="inline-block mt-3 text-xs text-emerald-600 group-hover:translate-x-1 transition">
            Ir a Personal →
          </span>
        </Link>

        <Link
          to="/asignaciones"
          className="group bg-white shadow-sm rounded-2xl p-4 border border-slate-100 hover:border-emerald-500 hover:shadow-md transition"
        >
          <h2 className="font-semibold text-slate-800 mb-1">Asignaciones</h2>
          <p className="text-sm text-slate-600">
            Define qué personal entra a qué geocercas y cuándo.
          </p>
          <span className="inline-block mt-3 text-xs text-emerald-600 group-hover:translate-x-1 transition">
            Ir a Asignaciones →
          </span>
        </Link>

        <Link
          to="/nueva-geocerca"
          className="group bg-white shadow-sm rounded-2xl p-4 border border-slate-100 hover:border-emerald-500 hover:shadow-md transition"
        >
          <h2 className="font-semibold text-slate-800 mb-1">Geocercas</h2>
          <p className="text-sm text-slate-600">
            Crea y edita geocercas para controlar accesos y presencia.
          </p>
          <span className="inline-block mt-3 text-xs text-emerald-600 group-hover:translate-x-1 transition">
            Ir a Geocercas →
          </span>
        </Link>

        <Link
          to="/tracker-dashboard"
          className="group bg-white shadow-sm rounded-2xl p-4 border border-slate-100 hover:border-emerald-500 hover:shadow-md transition"
        >
          <h2 className="font-semibold text-slate-800 mb-1">Tracker</h2>
          <p className="text-sm text-slate-600">
            Visualiza en tiempo real la ubicación de tu personal.
          </p>
          <span className="inline-block mt-3 text-xs text-emerald-600 group-hover:translate-x-1 transition">
            Ir al Tracker →
          </span>
        </Link>
      </div>

      {/* Bloque inferior: resumen rápido + botón de logout */}
      <div className="bg-white shadow-sm rounded-2xl p-5 border border-slate-100 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h3 className="font-semibold text-slate-800 mb-1">
            Resumen de sesión
          </h3>
          <p className="text-sm text-slate-600">
            Estás conectado como{" "}
            <span className="font-semibold">{displayEmail}</span> con rol{" "}
            <span className="font-semibold">{effectiveRole}</span> en la
            organización{" "}
            <span className="font-semibold">{orgName}</span>.
          </p>
        </div>
        <button
          onClick={handleLogout}
          className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-slate-800 text-white text-sm font-medium hover:bg-slate-900 transition"
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
