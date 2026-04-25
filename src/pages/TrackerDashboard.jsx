import { useEffect, useState } from "react";

export default function TrackerDashboard() {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/tracker-latest");
        const data = await res.json();

        // fallback seguro
        const safe = Array.isArray(data) ? data : [];
        setRows(safe);
      } catch (err) {
        console.error("Error loading tracker data", err);
        setRows([]);
      }
    }

    load();
  }, []);

  // ============================
  // SOURCE OF TRUTH
  // ============================

  const safeRows = Array.isArray(rows) ? rows : [];

  const activeTrackerUserIds = new Set(
    safeRows.map((r) => r?.user_id).filter(Boolean)
  );

  const latestRows = safeRows.filter((r) =>
    activeTrackerUserIds.has(r?.user_id)
  );

  // ============================
  // RENDER
  // ============================

  if (!latestRows.length) {
    return (
      <div style={{ padding: 20 }}>
        <h3>No hay datos de trackers</h3>
      </div>
    );
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>Trackers activos: {latestRows.length}</h2>

      <ul>
        {latestRows.map((r) => (
          <li key={r.user_id}>
            {r.user_id} → {r.lat}, {r.lng}
          </li>
        ))}
      </ul>
    </div>
  );
}