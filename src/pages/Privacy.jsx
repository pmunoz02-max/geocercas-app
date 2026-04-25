import React from "react";

export default function Privacy() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-2xl mx-auto p-8">
        <h1 className="text-3xl font-bold mb-4">Política de Privacidad</h1>
        <p className="mb-2">Esta es la política de privacidad de App Geocercas. Aquí se explica cómo recopilamos, usamos y protegemos tu información.</p>
        <ul className="list-disc pl-6 mb-4">
          <li>No compartimos tu información personal con terceros sin tu consentimiento.</li>
          <li>Solo usamos tus datos para operar y mejorar el servicio.</li>
          <li>Puedes solicitar la eliminación de tus datos en cualquier momento.</li>
        </ul>
        <p>Para más información, contacta a soporte.</p>
      </div>
    </div>
  );
}
