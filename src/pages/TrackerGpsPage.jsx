import { useState, useEffect } from "react";

export default function TrackerGpsPage() {
  const [msg, setMsg] = useState("Tracker base OK");
  const [ready, setReady] = useState(false);

  // Bridge Android: efecto plano, dentro del componente
  useEffect(() => {
    console.log("[TRACKER_STEP] bridge effect start");

    let token = null;
    let orgId = null;

    try {
      token = localStorage.getItem("tracker_access_token");
      orgId = localStorage.getItem("org_id");
    } catch (e) {
      console.error("[TRACKER_STEP] bridge localStorage error", e);
    }

    console.log(
      "[TRACKER_STEP] bridge read " +
        JSON.stringify({
          tokenPresent: !!token,
          orgIdPresent: !!orgId,
          androidAvailable: !!window?.Android,
        })
    );

    if (token && orgId) {
      try {
        console.log(
          "[TRACKER_SESSION_SEND] " +
            JSON.stringify({
              tokenPresent: !!token,
              orgIdPresent: !!orgId,
              androidAvailable: !!window?.Android?.saveSession,
            })
        );

        window?.Android?.saveSession?.(token, orgId);
      } catch (e) {
        console.error("[TRACKER_SESSION_SEND] error", e);
      }
    }
  }, []);

  // Bootstrap/polling local: solo logs y lectura de localStorage
  useEffect(() => {
    console.log("[TRACKER_STEP] bootstrap effect start");

    let disposed = false;
    let timerId = null;

    const run = () => {
      if (disposed) return;

      console.log("[TRACKER_STEP] polling tick");
      console.log("[TRACKER_STEP] before read localStorage");

      let token = null;
      let orgId = null;

      try {
        token = localStorage.getItem("tracker_access_token");
        orgId = localStorage.getItem("org_id");
      } catch (e) {
        console.error("[TRACKER_STEP] bootstrap localStorage error", e);
      }

      console.log(
        "[TRACKER_STEP] after read localStorage " +
          JSON.stringify({
            tokenPresent: !!token,
            orgIdPresent: !!orgId,
          })
      );

      const ready = !!token && !!orgId;
      if (ready) {
        setReady(true);
      }
      console.log(
        "[TRACKER_BOOT] " +
          JSON.stringify({
            tokenPresent: !!token,
            orgIdPresent: !!orgId,
            ready,
          })
      );

      timerId = window.setTimeout(run, 30000);
    };

    run();

    return () => {
      disposed = true;
      if (timerId) window.clearTimeout(timerId);
    };
  }, []);

  return (
      <div style={{ padding: 16 }}>
        {!ready ? (
          <h2>Inicializando tracker...</h2>
        ) : (
          <>
            <h2>Tracker activo</h2>
            <button onClick={() => setMsg("Clic OK")}>Probar estado</button>
          </>
        )}
      </div>
  );
}