import { useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

function supa() {
  const url = (import.meta.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
  return createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
}

function resolveOrgFromCtx(ctx) {
  return (
    ctx?.org_id ||
    ctx?.current_org_id ||
    ctx?.organization_id ||
    (Array.isArray(ctx?.organizations) ? ctx.organizations?.[0]?.id : null) ||
    null
  );
}

export default function TrackerGpsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [permission, setPermission] = useState("unknown");
  const [gpsActive, setGpsActive] = useState(false);

  const [orgId, setOrgId] = useState(null);
  const [intervalSec, setIntervalSec] = useState(300);

  const [lastPosition, setLastPosition] = useState(null);
  const [lastSend, setLastSend] = useState(null);
  const [sendStatus, setSendStatus] = useState("idle");
  const [sendError, setSendError] = useState(null);

  const lastSentAtRef = useRef(0);
  const watchIdRef = useRef(null);

  const clientRef = useRef(null);
  if (!clientRef.current) clientRef.current = supa();
  const client = clientRef.current;

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        if (!import.meta.env.VITE_SUPABASE_URL) throw new Error("Falta VITE_SUPABASE_URL");
        if (!import.meta.env.VITE_SUPABASE_ANON_KEY) throw new Error("Falta VITE_SUPABASE_ANON_KEY");

        // 1) asegurar que si vienes del link OTP, se capture la sesión en URL y se persista
        const { data: sessData } = await client.auth.getSession();
        const token = sessData?.session?.access_token;

        if (!token) {
          // No hay sesión Supabase => manda al bridge para pedir OTP (pero el guard NO debe bloquear esta ruta)
          const next = encodeURIComponent(window.location.pathname + window.location.search);
          window.location.href = `/tracker-auth-bridge?next=${next}`;
          return;
        }

        // 2) validar usuario
        const { data: u, error: ue } = await client.auth.getUser();
        if (ue || !u?.user) throw new Error("Supabase: usuario no válido");

        // 3) validar rol tracker por RPC
        const { data: ctx, error: ce } = await client.rpc("get_my_context");
        if (ce) throw new Error(`RPC get_my_context falló: ${ce.message}`);

        const role =
          String(ctx?.role || ctx?.my_role || ctx?.membership_role || "").toLowerCase();
        if (role !== "tracker") throw new Error(`Rol inválido (no tracker): ${role || "(vacío)"}`);

        const oid = resolveOrgFromCtx(ctx);
        if (!oid) throw new Error("No se pudo resolver org_id desde contexto");

        if (!alive) return;
        setOrgId(oid);

        // permiso (solo visual)
        if ("permissions" in navigator) {
          try {
            const p = await navigator.permissions.query({ name: "geolocation" });
            if (!alive) return;
            setPermission(p.state);
          } catch {
            setPermission("unknown");
          }
        }

        setLoading(false);
      } catch (e) {
        if (!alive) return;
        setError(String(e?.message || e));
        setLoading(false);
      }
    })();

    return () => { alive = false; };
  }, [client]);

  async function sendPosition(pos) {
    const now = Date.now();
    const minMs = Math.max(5, Number(intervalSec || 300)) * 1000;
    if (now - lastSentAtRef.current < minMs) return;
    lastSentAtRef.current = now;

    const { data: sessData } = await client.auth.getSession();
    const token = sessData?.session?.access_token;
    if (!token) {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `/tracker-auth-bridge?next=${next}`;
      return;
    }

    const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
    const url = `${supabaseUrl}/functions/v1/send_position`;

    const payload = {
      org_id: orgId,
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
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });

    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.ok) {
      setSendStatus("error");
      setSendError(j?.error || j?.details || `Error enviando (HTTP ${r.status})`);
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
    if (!orgId) {
      setError("OrgId aún no disponible.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      () => {
        setPermission("granted");

        watchIdRef.current = navigator.geolocation.watchPosition(
          async (pos) => {
            setGpsActive(true);
            const current = {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              ts: new Date().toISOString(),
            };
            setLastPosition(current);
            await sendPosition(pos);
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
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, []);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-600">Cargando tracker…</div>;
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="max-w-md w-full bg-white border rounded-xl p-6 shadow">
          <h2 className="text-lg font-semibold text-red-600 mb-3">Tracker</h2>
          <p className="text-sm text-gray-700 mb-4">{error}</p>
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
          <b>{permission === "granted" ? "Permitido" : permission === "denied" ? "Bloqueado" : "Pendiente"}</b>
        </p>

        <p className="text-xs text-emerald-800 mt-1">
          Org: <b>{orgId || "—"}</b>
        </p>

        <p className="text-xs text-emerald-800 mt-1">
          Intervalo de envío: <b>{intervalSec}s</b>
        </p>

        {!gpsActive && (
          <button onClick={startTracking} className="mt-4 w-full bg-emerald-600 text-white py-3 rounded-lg">
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
              Envío: <b>{sendStatus === "idle" ? "—" : sendStatus === "sending" ? "Enviando…" : sendStatus === "ok" ? "OK" : "Error"}</b>
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
