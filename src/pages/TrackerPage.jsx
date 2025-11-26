// src/pages/TrackerPage.jsx
// Página contenedora del tracker con botón “Invitar nuevo tracker”.
// Muestra email, rol y organización activa usando AuthContext + Supabase.

import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import Tracker from "./Tracker.jsx";
import { supabase } from "../supabaseClient";
import { useAuth } from "../context/AuthContext.jsx";

export default function TrackerPage() {
  const navigate = useNavigate();
  const { user: authUser, currentOrg, currentRole } = useAuth();

  const [sessionEmail, setSessionEmail] = useState(null);
  const [loadingSession, setLoadingSession] = useState(true);

  // Cargar sesión directa de Supabase (por si el AuthContext no trae el email)
  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      setLoadingSession(true);
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          console.error("[TrackerPage] Error obteniendo sesión:", error);
          if (!cancelled) setSessionEmail(null);
          return;
        }
        const email = data?.session?.user?.email || null;
        if (!cancelled) setSessionEmail(email);
      } catch (e) {
        console.error("[TrackerPage] Excepción obteniendo sesión:", e);
        if (!cancelled) setSessionEmail(null);
      } finally {
        if (!cancelled) setLoadingSession(false);
      }
    }

    loadSession();
    return () => {
      cancelled = true;
    };
  }, []);

  // Resolver email combinando AuthContext + Supabase
  const emailFromAuth =
    (authUser && (authUser.email || authUser.user?.email)) || null;

  let userEmail = "sin email en sesión";
  if (loadingSession && !sessionEmail && !emailFromAuth) {
    userEmail = "cargando...";
  } else if (sessionEmail) {
    userEmail = sessionEmail;
  } else if (emailFromAuth) {
    userEmail = emailFromAuth;
  }

  const orgName =
    (currentOrg &&
      (currentOrg.name ||
        currentOrg.org_name ||
        currentOrg.label ||
        currentOrg.descripcion)) ||
    "—";

  function handleInvite() {
    navigate("/invitar-tracker");
  }

  const canUseTracker =
    currentRole === "owner" ||
    currentRole === "admin" ||
    currentRole === "OWNER" ||
    currentRole === "ADMIN" ||
    currentRole === "tracker" ||
    currentRole === "TRACKER";

  return (
    <section className="max-w-6xl mx-auto space-y-4">
      {/* ENCABEZADO */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex flex-col">
          <h1 className="text-2xl font-semibold">Tracker</h1>
          <p className="text-sm text-slate-600">
            Esta pantalla convierte el dispositivo en un{" "}
            <strong>tracker GPS</strong>. Captura geolocalización y envía
            posiciones a la Edge Function configurada en{" "}
            <code className="bg-slate-100 px-1 rounded text-xs">
              VITE_EDGE_SEND_POSITION
            </code>
            .
          </p>
        </div>

        <div className="flex flex-wrap gap-2 justify-end">
          <button
            onClick={handleInvite}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
          >
            Invitar nuevo tracker
          </button>

          <Link
            to="/tracker-dashboard"
            className="px-4 py-2 rounded-lg text-sm font-medium border border-indigo-600 text-indigo-600 hover:bg-indigo-50"
          >
            Ver dashboard de tracking
          </Link>
        </div>
      </div>

      {/* INFO DEL USUARIO Y ORG */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm flex flex-col gap-1">
        <div>
          <strong>Usuario:</strong> {userEmail}
        </div>
        <div>
          <strong>Rol actual:</strong> {currentRole || "—"}
        </div>
        <div>
          <strong>Organización activa:</strong> {orgName}
        </div>
      </div>

      {/* TRACKER */}
      <div className="border rounded-xl p-3 bg-white">
        {canUseTracker ? (
          <Tracker />
        ) : (
          <p className="text-sm text-red-600">
            Tu rol actual no tiene permisos para usar el tracker GPS.
          </p>
        )}
      </div>
    </section>
  );
}
