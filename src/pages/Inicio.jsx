// src/pages/Inicio.jsx
import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export default function Inicio() {
  const { user, currentOrg, currentRole } = useAuth();

  // Si por alguna razón no hay rol, lo tratamos como tracker
  const roleLabel = currentRole || "tracker";

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <div className="bg-white shadow rounded-xl p-6 space-y-4">
        <h1 className="text-2xl font-bold text-slate-800">
          Sistema de Control de Personal con Geocercas
        </h1>

        <p className="text-slate-600">
          Administra tu personal, geocercas y actividades en un entorno
          multi-organización.
        </p>

        <p className="text-slate-700">
          Sesión iniciada como:{" "}
          <span className="font-semibold">{user?.email}</span> ({roleLabel})
        </p>

        <p className="text-slate-700">
          Organización:{" "}
          <span className="font-semibold">
            {currentOrg?.name || "No seleccionada"}
          </span>
        </p>

        <div className="flex gap-3">
          {/* 🔵 Ir al panel principal */}
          <Link
            to="/nueva-geocerca"
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
          >
            Ir al panel
          </Link>

          <Link
            to="/login"
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            Cerrar sesión
          </Link>
        </div>
      </div>

      <div className="bg-white shadow rounded-xl p-6">
        <h2 className="font-semibold text-slate-800 text-lg mb-2">
          Datos del Administrador
        </h2>
        <p>Nombre: {currentOrg?.owner_name || user?.email?.split("@")[0]}</p>
        <p>Correo: {user?.email}</p>
        <p>Rol: {roleLabel}</p>
      </div>
    </div>
  );
}
