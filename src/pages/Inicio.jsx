// src/pages/Inicio.jsx
import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export default function Inicio() {
  const navigate = useNavigate();
  const { user, role, currentOrg, profile } = useAuth();

  const displayName =
    profile?.full_name ||
    profile?.nombre ||
    user?.user_metadata?.full_name ||
    user?.email?.split("@")[0] ||
    "Usuario";

  const orgName = currentOrg?.name || currentOrg?.nombre || "—";

  return (
    <div className="max-w-6xl mx-auto">
      {/* Encabezado */}
      <section className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900 mb-1">
          App Geocercas
        </h1>
        <p className="text-sm text-slate-600">
          Dashboard de control de personal y geocercas en tiempo real.
        </p>
      </section>

      {/* Tarjetas de módulos */}
      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-10">
        {/* PERSONAL */}
        <Card
          title="Personal"
          description="Gestiona trabajadores, datos de contacto y estados."
          onClick={() => navigate("/personal")}
          linkLabel="Ir a Personal →"
        />

        {/* ASIGNACIONES */}
        <Card
          title="Asignaciones"
          description="Define qué personal entra a qué geocercas y cuándo."
          onClick={() => navigate("/asignaciones")}
          linkLabel="Ir a Asignaciones →"
        />

        {/* GEOCERCAS / NUEVA GEO */}
        <Card
          title="Geocercas"
          description="Crea y edita geocercas para controlar accesos y presencia."
          onClick={() => navigate("/nueva-geocerca")}
          linkLabel="Ir a Geocercas →"
        />

        {/* ACTIVIDADES */}
        <Card
          title="Actividades"
          description="Configura actividades y tarifas horarias por tipo de trabajo."
          onClick={() => navigate("/actividades")}
          linkLabel="Ir a Actividades →"
        />

        {/* COSTOS */}
        <Card
          title="Costos"
          description="Consulta costos por actividad, geocerca, persona y fechas."
          onClick={() => navigate("/costos")}
          linkLabel="Ir a Costos →"
        />

        {/* TRACKER */}
        <Card
          title="Tracker"
          description="Visualiza en tiempo real la ubicación de tu personal."
          onClick={() => navigate("/tracker-dashboard")}
          linkLabel="Ir al Tracker →"
        />

        {/* INVITAR TRACKER */}
        <Card
          title="Invitar tracker"
          description="Envía enlaces de acceso a tus trabajadores para que usen el tracker."
          onClick={() => navigate("/invitar-tracker")}
          linkLabel="Ir a Invitar tracker →"
        />
      </section>

      {/* Resumen de sesión */}
      <section className="border border-slate-200 rounded-xl p-4 bg-white flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <p className="text-sm text-slate-700 mb-1">
            Estás conectado como{" "}
            <span className="font-medium">{user?.email}</span> con rol{" "}
            <span className="font-semibold uppercase">{role}</span> en la
            organización{" "}
            <span className="font-medium">{orgName}</span>.
          </p>
          <p className="text-xs text-slate-500">
            Usuario: <span className="font-medium">{displayName}</span>
          </p>
        </div>
      </section>
    </div>
  );
}

function Card({ title, description, onClick, linkLabel }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left border border-slate-200 rounded-2xl p-4 bg-white hover:border-emerald-500 hover:shadow-sm transition-all flex flex-col justify-between"
    >
      <div className="mb-3">
        <h2 className="text-base font-semibold text-slate-900 mb-1">
          {title}
        </h2>
        <p className="text-sm text-slate-600">{description}</p>
      </div>
      <span className="text-sm font-medium text-emerald-600">
        {linkLabel}
      </span>
    </button>
  );
}
