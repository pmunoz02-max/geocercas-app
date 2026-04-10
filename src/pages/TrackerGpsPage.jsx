  // WatchPosition: envía cada update usando tracker_access_token vía fetch
  useEffect(() => {
    if (!ready) return;
    let watchId = null;
    let disposed = false;

    function handlePosition(pos) {
      if (disposed) return;
      let token = null;
      let orgId = null;
      try {
        token = localStorage.getItem("tracker_access_token");
        orgId = localStorage.getItem("org_id");
      } catch (e) {
        setMsg("ERROR localStorage " + (e?.message || "?"));
        return;
      }
      const lat = pos?.coords?.latitude;
      const lng = pos?.coords?.longitude;
      const accuracy = pos?.coords?.accuracy;
      const at = new Date().toISOString();
      if (!lat || !lng || !token || !orgId) return;

      const body = { org_id: orgId, lat, lng, accuracy, at };
      console.log("[SEND_POSITION_STEP] before", {
        status: "sending",
        ok: null,
        user: "tracker",
        body: { org_id: orgId, lat, lng, accuracy, at }
      });

      fetch("/api/send-position", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      })
        .then(async (res) => {
          let data = null;
          try { data = await res.json(); } catch {}
          if (!res.ok) {
            console.log("[SEND_POSITION_STEP] after", {
              status: res.status,
              ok: false,
              user: "tracker",
              body: { org_id: orgId, lat, lng, accuracy, at },
              error: data?.error || res.statusText
            });
            throw new Error(data?.error || res.statusText);
          }
          console.log("[SEND_POSITION_STEP] after", {
            status: res.status,
            ok: true,
            user: "tracker",
            body: { org_id: orgId, lat, lng, accuracy, at },
            result: data
          });
          setMsg("OK ✔");
        })
        .catch((err) => {
          console.error("[SEND_POSITION_STEP] error", err);
          setMsg("ERROR " + (err?.message || "?"));
        });
    }

    function handleError(err) {
      if (disposed) return;
      setMsg("GEO_ERROR " + (err?.message || err?.code || "?"));
    }

    if (navigator?.geolocation) {
      watchId = navigator.geolocation.watchPosition(handlePosition, handleError, {
        enableHighAccuracy: true,
        maximumAge: 10000,
        timeout: 20000,
      });
    } else {
      setMsg("Geolocation API not available");
    }

    return () => {
      disposed = true;
      if (watchId != null && navigator?.geolocation?.clearWatch) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [ready]);
import { useState, useEffect, useRef } from "react";

export default function TrackerGpsPage() {
  const [msg, setMsg] = useState("Tracker base OK");
  // Definir ready dentro del componente, antes de usarse
  let trackerAccessToken = null;
  let orgId = null;
  try {
    trackerAccessToken = localStorage.getItem("tracker_access_token");
    orgId = localStorage.getItem("org_id");
  } catch {}
  const ready = Boolean(trackerAccessToken && orgId);

  // Bridge Android: efecto plano, dentro del componente
  useEffect(() => {
    console.log("[TRACKER_STEP] bridge effect start");

    let token = trackerAccessToken;
    let org = orgId;

    console.log(
      "[TRACKER_STEP] bridge read " +
        JSON.stringify({
          tokenPresent: !!token,
          orgIdPresent: !!org,
          androidAvailable: !!window?.Android,
        })
    );

    if (token && org) {
      try {
        console.log(
          "[TRACKER_SESSION_SEND] " +
            JSON.stringify({
              tokenPresent: !!token,
              orgIdPresent: !!org,
              androidAvailable: !!window?.Android?.saveSession,
            })
        );

        window?.Android?.saveSession?.(token, org);
      } catch (e) {
        console.error("[TRACKER_SESSION_SEND] error", e);
      }
    }
  }, [trackerAccessToken, orgId]);

  // --- BLOQUE REAL DE TRACKING ---
  useEffect(() => {
    if (!ready) return;
    let watchId = null;
    let disposed = false;

    function handlePosition(pos) {
      if (disposed) return;
      let token = null;
      let orgId = null;
      try {
        token = localStorage.getItem("tracker_access_token");
        orgId = localStorage.getItem("org_id");
      } catch (e) {
        setMsg("ERROR localStorage " + (e?.message || "?"));
        return;
      }
      const lat = pos?.coords?.latitude;
      const lng = pos?.coords?.longitude;
      const accuracy = pos?.coords?.accuracy;
      const at = new Date().toISOString();
      if (!lat || !lng || !token || !orgId) return;

      const body = { org_id: orgId, lat, lng, accuracy, at };
      console.log("[SEND_POSITION_STEP] before", { tokenPresent: !!token, orgIdPresent: !!orgId, lat, lng, accuracy, at });

      fetch("/api/send-position", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      })
        .then(async (res) => {
          let data = null;
          try { data = await res.json(); } catch {}
          if (!res.ok) throw new Error(data?.error || res.statusText);
          console.log("[SEND_POSITION_STEP] success", { data });
          setMsg("OK ✔");
        })
        .catch((err) => {
          console.error("[SEND_POSITION_STEP] error", err);
          setMsg("ERROR " + (err?.message || "?"));
        });
    }

    function handleError(err) {
      if (disposed) return;
      setMsg("GEO_ERROR " + (err?.message || err?.code || "?"));
    }

    if (navigator?.geolocation) {
      watchId = navigator.geolocation.watchPosition(handlePosition, handleError, {
        enableHighAccuracy: true,
        maximumAge: 10000,
        timeout: 20000,
      });
    } else {
      setMsg("Geolocation API not available");
    }

    return () => {
      disposed = true;
      if (watchId != null && navigator?.geolocation?.clearWatch) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [ready]);

  return (
      <div style={{ padding: 16 }}>
        {!ready ? (
          <h2>Inicializando tracker...</h2>
        ) : (
          <div
            style={{
              width: "100%",
              maxWidth: 760,
              border: "1px solid #d0d7de",
              borderRadius: 12,
              padding: 20,
              background: "#f8f9fb",
              marginTop: 24,
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
              Tracker activo
            </div>
            <div style={{ fontSize: 15, marginBottom: 8 }}>
              El tracking está funcionando correctamente.<br />
              Último estado: <b>{msg}</b>
            </div>
            <button
              type="button"
              onClick={() => setMsg("Clic OK")}
              style={{
                border: "none",
                borderRadius: 10,
                padding: "12px 16px",
                fontSize: 15,
                fontWeight: 600,
                cursor: "pointer",
                background: "#222",
                color: "#fff",
                marginTop: 12,
              }}
            >
              Probar estado
            </button>
          </div>
        )}
      </div>
  );
}