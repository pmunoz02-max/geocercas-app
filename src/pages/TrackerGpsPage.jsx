
import { useState } from "react";

export default function TrackerGpsPage() {
  const [msg, setMsg] = useState("Tracker base OK");
  return (
    <div>
      <h2>{msg}</h2>
      <button onClick={() => setMsg("Clic OK")}>Probar estado</button>
    </div>
  );
}
