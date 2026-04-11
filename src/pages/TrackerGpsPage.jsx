import { useState, useEffect } from "react";

export default function TrackerGpsPage() {
  const [msg, setMsg] = useState("Tracker base OK");

  // Leer credenciales
  let trackerAccessToken = null;
  let orgId = null;

  try {
    trackerAccessToken = localStorage.getItem("tracker_access_token");
    orgId = localStorage.getItem("org_id");
  } catch {}

  const ready = Boolean(trackerAccessToken && orgId);

  // Bridge Android → guardar sesión
  useEffect(() => {
    console.log("[TRACKER_STEP] bridge effect start");

    if (trackerAccessToken && orgId) {
      try {
        console.log("[TRACKER_SESSION_SEND]", {
          tokenPresent: true,
          orgIdPresent: true,
          androidAvailable: !!window?.Android?.saveSession,
        });

        window?.Android?.saveSession?.(trackerAccessToken, orgId);
      } catch (e) {
        console.error("[TRACKER_SESSION_SEND] error", e);
      }
    }
  }, [trackerAccessToken, orgId]);

  // 🚀 BLOQUE REAL DE TRACKING
  useEffect(() => {
    if (!ready) return;

    let watchId = null;
    let disposed = false;

    function handlePosition(pos) {
      if (disposed) return;

      let token = null;
      let org = null;

      try {
        token = localStorage.getItem("tracker_access_token");
        org = localStorage.getItem("org_id");
      } catch (e) {
        setMsg("ERROR localStorage " + (e?.message || "?"));
        return;
      }

      const lat = pos?.coords?.latitude;
      const lng = pos?.coords?.longitude;
      const accuracy = pos?.coords?.accuracy;
      const timestamp = new Date().toISOString();

      if (!lat || !lng || !token || !org) return;

      const body = {
        org_id: org,
        lat,
        lng,
        accuracy,
        timestamp,
      };

      console.log("[SEND_POSITION_STEP] request started", body);

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
          try {
            data = await res.json();
          } catch {}

          console.log("[SEND_POSITION_STEP] status", res.status);
          console.log("[SEND_POSITION_STEP] ok", res.ok);
          console.log("[SEND_POSITION_STEP] response", data);

          if (!res.ok) {
            throw new Error(data?.error || res.statusText);
          }

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
      watchId = navigator.geolocation.watchPosition(
        handlePosition,
        handleError,
        {
          enableHighAccuracy: true,
          maximumAge: 10000,
          timeout: 20000,
        }
      );
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

  // Ejemplo de función para aceptar invitación y persistir sesión runtime
  async function acceptTrackerInvite(invitePayload) {
    const url = "https://mujwsfhkocsuuahlrssn.supabase.co/functions/v1/accept-tracker-invite";
    console.log("[ACCEPT_CALL] URL:", url);
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inviteToken: invitePayload.inviteToken,
        org_id: invitePayload.org_id,
      }),
    });
    const data = await resp.json();
    console.log("[ACCEPT_RESPONSE]", data);

    const token = data?.session?.access_token;
    const userId = data?.tracker_user_id;

    if (!token || !userId) {
      throw new Error("missing runtime session data");
    }

    // Guardar limpio (sin mezclar con auth normal)
    localStorage.setItem("tracker_runtime_token", token);
    localStorage.setItem("tracker_user_id", userId);

    // Eliminar cualquier token viejo
    localStorage.removeItem("tracker_token");
    localStorage.removeItem("supabase.auth.token");

    // Enviar a Android
    if (window.Android?.setTrackerSession) {
      window.Android.setTrackerSession(token, userId);
    }
  }

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
            El tracking está funcionando correctamente.
            <br />
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