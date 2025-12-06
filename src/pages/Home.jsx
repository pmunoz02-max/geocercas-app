// src/pages/Home.jsx
import React from "react";
import Inicio from "./Inicio.jsx";

/**
 * Home actúa como un alias de la página Inicio.
 * Cualquier ruta antigua que todavía apunte a <Home />
 * mostrará exactamente el mismo contenido que /inicio,
 * incluyendo las nuevas tarjetas de ayuda.
 */
export default function Home() {
  return <Inicio />;
}
