// src/pages/TrackerAuto.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import Tracker from "./Tracker";

const LAST_ORG_KEY = "app_geocercas_last_org_id";

function normEmail(v) {
  return String(v || "").trim().toLowerCase();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseQuery() {
  const p = new URLSearchParams(window.location.search || "");
  return {
    invitedEmail: normEmail(p.get("invited_email") || ""),
    orgId: String(p.get("org_id") || "").trim(),
    tgFlow: String(p.get("tg_flow") || "").trim(),
  };
}

function hasHashTokens() {
  const h = (window.location.hash || "").toLowerCase();
  return h.includes("access_token=") || h.includes("refresh_token=");
}

export default function TrackerAuto() {
  const navigate = useNavigate();

  const { invitedEmail, orgId, tgFlow } = useMemo(() => parseQuery(), []);
  const isTrackerFlow = String(tgFlow).toLowerCase() === "tracker";

  const [loading, setLoading] = useState(true);
  const [sessionEmail, setSessionEmail] = useState("");
  const [sessionExists, setSessionExists] = useState(false);
  const [mismatch, setMismatch] = useState(false);
  const [err, setErr] = useState("");

  // 1) Setear org activa si viene en el link (clave multi-org)
  useEffect(() => {
    if (!orgId) return;
    try {
      localStorage.setItem(LAST_ORG_KEY, orgId);
    } catch {}
  }, [orgId]);

  // 2) Esperar sesión (NO disparar mismatch mientras loading)
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setErr("");
        setMismatch(false);

        // ✅ Consumir tokens del URL si vienen (magic link directo a esta ruta)
        if (hasHashTokens()) {
          try {
            await supabase.auth.getSessionFromUrl({ storeSession: true });
          } catch {
            // ignore
          }
        }

        // Espera corta para que Supabase hidrate sesión desde tokens
        const start = Date.now();
        let found = null;

        while (Date.now() - start < 8000) {
          const { data } = await supabase.auth.getSession();
          const s = data?.session || null;

          if (s?.user?.email && s?.access_token) {
            found = s;
            break;
          }

          await sleep(200);
        }

        if (cancelled) return;

        const se = found?.user?.email ? normEmail(found.user.email) : "";
        const has = Boolean(found?.access_token && se);

        setSessionExists(has);
        setSessionEmail(se);

        // mismatch REAL solo si hay sesión y email distinto
        if (has && invitedEmail && se !== invitedEmail) {
          setMismatch(true);
        } else {
          setMismatch(false);
        }
      } catch (e) {
        if (cancelled) return;
        setErr(String(e?.message || e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [invitedEmail]);

  async function handleSignOutAndGoHome() {
    try {
      await supabase.auth.signOut();
    } catch {}
    navigate("/inicio", { replace: true });
  }

  function goHome() {
    navigate("/inicio", { replace: true });
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-white border rounded-2xl p-6 shadow">
          <h2 className="text-xl font-semibold mb-2">Autenticando tracker…</h2>
          <p className="text-sm text-gray-700">
            Estamos validando tu sesión. Si abriste el link recién, esto puede tardar unos segundos.
          </p>

          <div className="mt-4 text-xs text-gray-500 space-y-1">
            <div>
              <b>Invited:</b> {invitedEmail || "—"}
            </div>
            <div>
              <b>Org:</b> {orgId || "—"}
            </div>
            <div>
              <b>Flow:</b> {isTrackerFlow ? "tracker" : "—"}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (err) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-white border rounded-2xl p-6 shadow">
          <h2 className="text-xl font-semibold mb-2">Error</h2>
          <p className="text-sm text-gray-700 break-words">{err}</p>

          <button
            onClick={goHome}
            className="mt-5 w-full py-3 rounded-xl font-bold text-white bg-gray-900 hover:bg-black"
          >
            Ir a inicio
          </button>
        </div>
      </div>
    );
  }

  if (!sessionExists) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-white border rounded-2xl p-6 shadow">
          <h2 className="text-xl font-semibold mb-2">No hay sesión activa</h2>

          <p className="text-sm text-gray-700">
            Esta pantalla necesita una sesión creada desde el enlace del email. Abre el enlace
            nuevamente (idealmente en incógnito si estabas logueado como admin).
          </p>

          <div className="mt-4 text-xs text-gray-500 space-y-1">
            <div>
              <b>Esperado:</b> {invitedEmail || "—"}
            </div>
            <div>
              <b>Actual:</b> (sin sesión)
            </div>
            <div>
              <b>Org:</b> {orgId || "—"}
            </div>
          </div>

          <button
            onClick={goHome}
            className="mt-5 w-full py-3 rounded-xl font-bold text-white bg-gray-900 hover:bg-black"
          >
            Entendido
          </button>
        </div>
      </div>
    );
  }

  if (mismatch) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-white border rounded-2xl p-6 shadow">
          <h2 className="text-xl font-semibold mb-2">Sesión incorrecta</h2>

          <p className="text-sm text-gray-700">Esta sesión no corresponde al tracker invitado.</p>

          <div className="mt-4 text-xs text-gray-500 space-y-1">
            <div>
              <b>Esperado:</b> {invitedEmail || "—"}
            </div>
            <div>
              <b>Actual:</b> {sessionEmail || "—"}
            </div>
            <div>
              <b>Org:</b> {orgId || "—"}
            </div>
          </div>

          <p className="text-sm text-gray-700 mt-4">
            Cierra sesión y abre el enlace del email nuevamente (mejor en incógnito).
          </p>

          <button
            onClick={handleSignOutAndGoHome}
            className="mt-5 w-full py-3 rounded-xl font-bold text-white bg-gray-900 hover:bg-black"
          >
            Entendido
          </button>
        </div>
      </div>
    );
  }

  return <Tracker />;
}
