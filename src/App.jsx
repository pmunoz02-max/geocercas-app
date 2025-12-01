// src/App.jsx
import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import PersonalPage from "./components/personal/PersonalPage.jsx";
import NuevaGeocerca from "./components/geocercas/NuevaGeocerca.jsx";

// Páginas del panel
import GeocercasPage from "./pages/GeocercasPage.jsx";
import ActividadesPage from "./pages/ActividadesPage.jsx";
import AsignacionesPage from "./pages/AsignacionesPage.jsx";
import CostosPage from "./pages/CostosPage.jsx";
import AdminsPage from "./pages/AdminsPage.jsx";
import TrackerDashboard from "./pages/TrackerDashboard.jsx";
import InvitarTracker from "./pages/InvitarTracker.jsx";

// Auth + especiales
import Login from "./pages/Login.tsx";        // 👈 AQUÍ usamos Login.tsx, no Login.jsx
import AuthCallback from "./pages/AuthCallback";
import Inicio from "./pages/Inicio.jsx";
import Landing from "./pages/Landing.jsx";
import TrackerGpsPage from "./pages/TrackerGpsPage.jsx";

import ProtectedShell from "./layout/ProtectedShell.jsx";

// Layout sencillo para la pantalla de login (sin AppHeader)
function LoginShell() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <Login />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Landing pública */}
        <Route path="/" element={<Landing />} />

        {/* Ruta especial de tracker (Magic Link, GPS) */}
        <Route path="/tracker-gps" element={<TrackerGpsPage />} />

        {/* Callback de Supabase Auth (Magic Link) */}
        <Route path="/auth/callback" element={<AuthCallback />} />

        {/* Login aislado, sin AppHeader */}
        <Route path="/login" element={<LoginShell />} />

        {/* Rutas protegidas (owner / admin) con layout + tabs */}
        <Route element={<ProtectedShell />}>
          <Route path="/inicio" element={<Inicio />} />
          <Route path="/nueva-geocerca" element={<NuevaGeocerca />} />
          <Route path="/geocercas" element={<GeocercasPage />} />
          <Route path="/personal" element={<PersonalPage />} />
          <Route path="/actividades" element={<ActividadesPage />} />
          <Route path="/asignaciones" element={<AsignacionesPage />} />
          <Route path="/costos" element={<CostosPage />} />
          <Route path="/tracker-dashboard" element={<TrackerDashboard />} />
          <Route path="/invitar-tracker" element={<InvitarTracker />} />
          <Route path="/admins" element={<AdminsPage />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/inicio" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
