// src/App.jsx
import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Inicio from "./pages/Inicio.jsx";
import Login from "./pages/Login.jsx";
import NuevaGeocerca from "./components/geocercas/NuevaGeocerca.jsx";
import Geocercas from "./pages/Geocercas.jsx";
import Personal from "./pages/Personal.jsx";
import Actividades from "./pages/Actividades.jsx";
import Asignaciones from "./pages/Asignaciones.jsx";
import Costos from "./pages/Costos.jsx";
import TrackerDashboard from "./pages/TrackerDashboard.jsx";
import TrackerGpsPage from "./pages/TrackerGpsPage.jsx";
import InvitarTracker from "./pages/InvitarTracker.jsx";
import Admins from "./pages/Admins.jsx";

import ProtectedShell from "./layout/ProtectedShell.jsx";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* RUTAS PÚBLICAS */}
        <Route path="/login" element={<Login />} />
        <Route path="/tracker-gps" element={<TrackerGpsPage />} />

        {/* RUTAS PROTEGIDAS (owner/admin) */}
        <Route element={<ProtectedShell />}>
          <Route path="/inicio" element={<Inicio />} />
          <Route path="/nueva-geocerca" element={<NuevaGeocerca />} />
          <Route path="/geocercas" element={<Geocercas />} />
          <Route path="/personal" element={<Personal />} />
          <Route path="/actividades" element={<Actividades />} />
          <Route path="/asignaciones" element={<Asignaciones />} />
          <Route path="/costos" element={<Costos />} />
          <Route path="/tracker-dashboard" element={<TrackerDashboard />} />
          <Route path="/invitar-tracker" element={<InvitarTracker />} />
          <Route path="/admins" element={<Admins />} />
        </Route>

        {/* DEFAULT */}
        <Route path="*" element={<Navigate to="/inicio" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
