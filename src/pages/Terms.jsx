import React from "react";

export default function Terms() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-2xl mx-auto p-8">
        <h1 className="text-3xl font-bold mb-4">Términos y Condiciones</h1>
        <p className="mb-2">Estos son los términos y condiciones de uso de App Geocercas. Al utilizar el servicio, aceptas lo siguiente:</p>
        <ul className="list-disc pl-6 mb-4">
          <li>Debes usar la aplicación de acuerdo a la ley y las políticas establecidas.</li>
          <li>No está permitido el uso indebido o fraudulento del servicio.</li>
          <li>Nos reservamos el derecho de modificar estos términos en cualquier momento.</li>
        </ul>
        <p>Para dudas o aclaraciones, contacta a soporte.</p>
      </div>
    </div>
  );
}
