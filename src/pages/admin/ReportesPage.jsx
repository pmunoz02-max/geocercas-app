import React from "react";
import { Link } from "react-router-dom";

export default function ReportesPage() {
  return (
    <div className="min-h-screen p-6 md:p-10">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Reportes</h2>
        <Link
          to="/admin"
          className="rounded-lg border px-4 py-2 hover:bg-gray-50"
        >
          ← Volver
        </Link>
      </div>

      <div className="rounded-2xl border p-6 text-gray-600">
        Reportes de entradas/salidas y cumplimiento.
      </div>
    </div>
  );
}

