// src/pages/GeocercasPage.jsx
import React from "react";

// Reutilizamos tu página estable de geocercas.
// Si cambiaste la ubicación del archivo, ajusta la ruta.
import Geocercas from "./Geocercas.jsx";

/**
 * GeocercasPage
 * Wrapper simple para integrarse con tu enrutador (App.jsx/Routes).
 * No introduce Providers adicionales (evita "Multiple GoTrueClient instances").
 * Mantiene intactos los módulos que ya funcionan.
 */
export default function GeocercasPage() {
  return <Geocercas />;
}

