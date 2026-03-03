// src/pages/BillingCancel.jsx
import React from "react";
import { useNavigate } from "react-router-dom";

export default function BillingCancel() {
  const navigate = useNavigate();

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-8 space-y-4">
        <h1 className="text-2xl font-semibold text-slate-900">Checkout cancelado</h1>
        <p className="text-slate-700">No se realizó ningún cobro.</p>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate("/billing")}
            className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold px-5 py-3 transition"
          >
            Volver a Billing
          </button>
          <button
            type="button"
            onClick={() => navigate("/inicio")}
            className="rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-900 font-medium px-5 py-3 transition"
          >
            Ir a Inicio
          </button>
        </div>
      </div>
    </div>
  );
}