import { useEffect, useState } from "react";
import { useOrg } from "../context/OrgProvider";
import { supabase } from "../lib/supabaseClient";

export default function TrackerDashboard() {
  const [rows, setRows] = useState([]);
  const { currentOrgId } = useOrg();

  useEffect(() => {
    async function load() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        const token = session?.access_token;

        const orgId = currentOrgId;
        const from = "2026-01-01";
        const to = new Date().toISOString();

        const res = await fetch(
          `/api/reportes?action=tracker_latest&org_id=${orgId}&from=${from}&to=${to}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!res.ok) {
          throw new Error("API error");
        }

        const data = await res.json();

        const safe = Array.isArray(data) ? data : [];
        setRows(safe);
      } catch (err) {
        console.error("Error loading tracker data", err);
        setRows([]);
      }
    }

    if (currentOrgId) {
      load();
    }
  }, [currentOrgId]);

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