// src/pages/TrackerGpsPage.jsx
import { useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

// --- Supabase client (para bootstrap de sesión en localStorage) ---
function getSupabaseUrl() {
  return (import.meta.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
}
function getSupabaseAnonKey() {
  return import.meta.env.VITE_SUPABASE_ANON_KEY || "";
}

const supabase = createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// --- Helpers ---
function safeJsonParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getSupabaseAccessTokenFromLocalStorage() {
  try {
    const keys = Object.keys(window.localStorage || {});
    // soporta sb-xxx-auth-token (supabase-js)
    const candidates = keys.filter((x) => /^sb-.*-auth-token$/i.test(String(x)));
    for (const k of candidates) {
      const raw = window.localStorage.getItem(k);
      if (!raw) continue;
      const j = safeJsonParse(raw);
      const t =
        j?.access_token ||
        j?.currentSession?.access_token ||
        j?.data?.session?.access_token ||
        "";
      if (t) return t;
    }
    return "";
  } catch {
    return "";
  }
}

async function ensureSupabaseSession() {
  // fuerza a Supabase a leer sesión existente (si la hay) y persistirla en localStorage
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token || "";
    if (token) return token;

    // fallback: a veces tarda un momento en persistir
    await new Promise((r) => setTimeout(r, 250));
    return getSupabaseAccessTokenFromLocalStorage();
  } catch {
    return getSupabaseAccessTokenFromLocalStorage();
  }
}

function resolveOrgId(sess) {
  return (
    sess?.org_id ||
    sess?.current_org_id ||
    sess?.org?.id ||
    sess?.organizations?.[0]?.id ||
    null
  );
}

function resolveEmail(sess) {
  return sess?.user?.email || sess?.email || sess?.profile?.email || "";
}

export default function TrackerGpsPage() {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [error, setError] = useState(null);

  const [permission, setPermission] = useState("unknown");
  const [gpsActive, setGpsActive] = useState(false);

  const [lastPosition, setLastPosition] = useState(null);
  const [lastSend, setLastSend] = useState(null);
  const [sendStatus, setSendStatus] = useState("idle");
  const [sendError, setSendError] = useState(null);

  const [intervalSec, setIntervalSec] = useState(30);

  const lastSentAtRef = useRef(0);
  const watchIdRef = useRef(null);

  async function loadSession() {
    const res = await fetch("/api/auth/session", { credentials: "include" });
    const json = await res.json().catch(() => ({}));
    setSession(json);

    if (!json?.authenticated) throw new Error("No autenticado");

    const role = String(json?.role || "").toLowerCase();
    if (role !== "tracker") throw new Error(`Rol inválido para tracker-gps: ${role || "(vacío)"}`);

    return json;
  }

  async function loadInterval(org_id, email) {
    try {
      const token = await ensureSupabaseSession();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const url = `/api/personal?onlyActive=1&limit=50&org_id=${encodeURIComponent(
        org_id
      )}&q=${encodeURIComponent(email)}`;
      const res = await fetch(url, { headers });
      const j = await res.json().catch(() => ({}));
      const items = j?.items || j?.data || [];

      const found = Array.isArray(items)
        ? items.find(
            (p) =>
              String(p.email_norm || p.email || "").toLowerCase() ===
              String(email).toLowerCase()
          )
        : null;

      const sec = Number(found?.position_interval_sec);
      if (Number.isFinite(sec) && sec > 0) setIntervalSec(sec);
    } catch {}
  }

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        // 1) validar sesión server-side (tu flujo actual)
        const s = await loadSession();
        if (!alive) return;

        // 2) bootstrap de sesión Supabase (para que exista access_token en localStorage)
        const anon = getSupabaseAnonKey();
        if (!anon) {
          setError("Falta VITE_SUPABASE_ANON_KEY (requerida para Edge Function).");
          setLoading(false);
          return;
        }
        await ensureSupabaseSession();

        setLoading(false);

        if ("permissions" in navigator) {
          try {
            const p = await navigator.permissions.query({ name: "geolocation" });
            if (!alive) return;
            setPermission(p.state);
          } catch {
            setPermission("unknown");
          }
        }

        const orgId = resolveOrgId(s);
        const email = resolveEmail(s);

        if (orgId && email) loadInterval(orgId, email);
      } catch (e) {
        if (!alive) return;
        setError(e.message || "Error cargando sesión");
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  async function sendPosition(pos, org_id) {
    const now = Date.now();
    const minMs = Math.max(5, Number(intervalSec || 30)) * 1000;
    if (now - lastSentAtRef.current < minMs) return;
    lastSentAtRef.current = now;

    // token (bootstrap incluido)
    let token = getSupabaseAccessTokenFromLocalStorage();
    if (!token) token = await ensureSupabaseSession();

    if (!token) {
      setSendStatus("error");
      setSendError("No access_token (localStorage) incluso tras bootstrap. Re-login.");
      return;
    }

    const supabaseUrl = getSupabaseUrl();
    if (!supabaseUrl) {
      setSendStatus("error");
      setSendError("Falta VITE_SUPABASE_URL.");
      return;
    }

    const url = `${supabaseUrl}/functions/v1/send_position`;

    const payload = {
      org_id,
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy ?? null,
      heading: pos.coords.heading ?? null,
      speed: pos.coords.speed ?? null,
      altitude: pos.coords.altitude ?? null,
      ts: new Date().toISOString(),
      source: "tracker-gps",
    };

    setSendStatus("sending");
    setSendError(null);

    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const j = await r.json().catch(() => ({}));

    if (!r.ok || !j?.ok) {
      setSendStatus("error");
      setSendError(j?.error || j?.details || `Error enviando posición (HTTP ${r.status})`);
      return;
    }

    setSendStatus("ok");
    setLastSend({ ts: payload.ts, table: j.table });
  }

  function startTracking() {
    if (!("geolocation" in navigator)) {
      setError("Este dispositivo no soporta GPS.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      () => {
        setPermission("granted");

        const orgId = resolveOrgId(session);
        if (!orgId) {
          setError("org_id no disponible en sesión (usa current_org_id).");
          return;
        }

        watchIdRef.current = navigator.geolocation.watchPosition(
          async (pos) => {
            setGpsActive(true);

            const current = {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              ts: new Date().toISOString(),
            };
            setLastPosition(current);

            await sendPosition(pos, orgId);
          },
          (err) => {
            setGpsActive(false);
            setError(err.message || "Error obteniendo ubicación");
          },
          { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
        );
      },
      () => {
        setPermission("denied");
        setError("Permiso de ubicación denegado.");
      }
    );
  }

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-600">
        Cargando tracker…
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="max-w-md w-full bg-white border rounded-xl p-6 shadow">
          <h2 className="text-lg font-semibold text-red-600 mb-3">Acceso restringido</h2>
          <p className="text-sm text-gray-700 mb-4">{error}</p>
          <pre className="text-xs bg-gray-100 p-3 rounded overflow-auto">
{JSON.stringify(session, null, 2)}
          </pre>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 max-w-md w-full">
        <h1 className="text-lg font-semibold text-emerald-700">Tracker activo</h1>

        <p className="text-sm text-emerald-700 mt-2">
          Estado del GPS:{" "}
          <b>
            {permission === "granted"
              ? "Permitido"
              : permission === "denied"
              ? "Bloqueado"
              : "Pendiente"}
          </b>
        </p>

        <p className="text-xs text-emerald-800 mt-1">
          Org: <b>{resolveOrgId(session) || "—"}</b>
        </p>

        <p className="text-xs text-emerald-800 mt-1">
          Intervalo de envío: <b>{intervalSec}s</b>
        </p>

        {!gpsActive && (
          <button
            onClick={startTracking}
            className="mt-4 w-full bg-emerald-600 text-white py-3 rounded-lg"
          >
            Activar ubicación
          </button>
        )}

        {gpsActive && lastPosition && (
          <div className="mt-4 text-sm text-emerald-800">
            <div>📡 GPS activo</div>
            <div>Lat: {lastPosition.lat}</div>
            <div>Lng: {lastPosition.lng}</div>
            <div>Última lectura: {lastPosition.ts}</div>

            <div className="mt-2">
              Envío:{" "}
              <b>
                {sendStatus === "idle"
                  ? "—"
                  : sendStatus === "sending"
                  ? "Enviando…"
                  : sendStatus === "ok"
                  ? "OK"
                  : "Error"}
              </b>
            </div>

            {lastSend?.ts && (
              <div className="text-xs">
                Último envío: {lastSend.ts} (tabla: {lastSend.table})
              </div>
            )}

            {sendError && <div className="text-xs text-red-700 mt-1">{sendError}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
