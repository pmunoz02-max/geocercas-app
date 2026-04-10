  // Bridge Android: useEffect plano, sin helpers ni lógica extra
  useEffect(() => {
    console.log("[TRACKER_STEP] bridge effect start");

    const token = localStorage.getItem("tracker_access_token");
    const orgId = localStorage.getItem("org_id");

    console.log(
      "[TRACKER_STEP] bridge read " +
        JSON.stringify({
          tokenPresent: !!token,
          orgIdPresent: !!orgId,
          androidAvailable: !!window?.Android,
        })
    );
  }, []);

import { useState, useEffect } from "react";

export default function TrackerGpsPage() {
  const [msg, setMsg] = useState("Tracker base OK");
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
      } catch {}
      console.log("[TRACKER_STEP] after read localStorage", { tokenPresent: !!token, orgIdPresent: !!orgId });
      timerId = window.setTimeout(run, 30000);
    };

    run();

    return () => {
      disposed = true;
      if (timerId) window.clearTimeout(timerId);
    };
  }, []);
  return (
    <div>
      <h2>{msg}</h2>
      <button onClick={() => setMsg("Clic OK")}>Probar estado</button>
    </div>
  );
}
