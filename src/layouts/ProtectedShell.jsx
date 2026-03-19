// src/layouts/ProtectedShell.jsx
import { Outlet, useLocation } from "react-router-dom";
import { useRef } from "react";
import { useAuth } from "@/context/auth.js";
import AppHeader from "../components/AppHeader.jsx";
import TopTabs from "../components/TopTabs.jsx";

/**
 * ProtectedShell — Tabs
 * - Tab "Geocerca" abre el MAPA (ruta /geocerca)
 * - La pantalla hub/listado queda en /geocercas (sin tab)
 * - Billing / Pricing visibles solo para perfiles de gestión
 * - Tracker debe quedar junto a "Invitar tracker"
 * - Pricing y Billing al extremo derecho
 */

function buildTabs({ role, isAppRoot }) {
  const r = String(role || "").toLowerCase();

  const isTrackerOnly = r === "tracker";
  const isAdmin =
    r === "admin" ||
    r === "owner" ||
    r === "root" ||
    r === "root_owner" ||
    isAppRoot;

  if (isTrackerOnly) {
    return [{ path: "/tracker", labelKey: "app.tabs.tracker" }];
  }

  const tabs = [
    { path: "/inicio", labelKey: "app.tabs.inicio" },

    // MAPA / CONSTRUCTOR
    { path: "/geocerca", labelKey: "app.tabs.geocerca" },

    { path: "/personal", labelKey: "app.tabs.personal" },
    { path: "/actividades", labelKey: "app.tabs.actividades" },
    { path: "/asignaciones", labelKey: "app.tabs.asignaciones" },
    { path: "/reportes", labelKey: "app.tabs.reportes" },
    { path: "/dashboard", labelKey: "app.tabs.dashboard" },
  ];

  if (isAdmin) {
    tabs.push(
      { path: "/tracker", labelKey: "app.tabs.tracker" },
      { path: "/invitar-tracker", labelKey: "app.tabs.invitarTracker" },
      { path: "/pricing", labelKey: "app.tabs.pricing" },
      { path: "/billing", labelKey: "app.tabs.billing" }
    );
  } else {
    tabs.push({ path: "/tracker", labelKey: "app.tabs.tracker" });
  }

  if (isAppRoot) {
    tabs.push({ path: "/admins", labelKey: "app.tabs.admins" });
  }

  return tabs;
}

export default function ProtectedShell() {
  const { loading, user, currentRole, isAppRoot } = useAuth();
  const location = useLocation();
  const bypassLoggedRef = useRef(false);

  const isTrackerRoute =
    location.pathname.startsWith("/tracker") || location.pathname.startsWith("/tracker-gps");

  if (isTrackerRoute && user) {
    if (!bypassLoggedRef.current) {
      console.warn("[tracker-auth-bootstrap] source=ProtectedShell");
      console.warn("[tracker-auth-bootstrap] bypassed");
      console.warn("[ROOT-BYPASS] tracker flow unblocked at root");
      bypassLoggedRef.current = true;
    }
  }

  if (loading) return null;
  if (!user) return null;

  const tabs = buildTabs({ role: currentRole, isAppRoot });

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader />
      <TopTabs tabs={tabs} />

      <main className="max-w-7xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}