import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const DEFAULT_FROM = "2026-01-01";

function normalizeRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.rows)) return payload.rows;
  if (Array.isArray(payload?.trackers)) return payload.trackers;
  if (Array.isArray(payload?.latestRows)) return payload.latestRows;
  if (Array.isArray(payload?.tracker_latest)) return payload.tracker_latest;
  if (Array.isArray(payload?.result)) return payload.result;
  return [];
}

function normalizeTrackerRow(row) {
  if (!row) return null;

  const userId = row.user_id || row.tracker_user_id || row.tracker_id || row.personal_id;
  const lat = Number(row.lat ?? row.latitude);
  const lng = Number(row.lng ?? row.lon ?? row.longitude);

  if (!userId) return null;

  return {
    ...row,
    user_id: String(userId),
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    recorded_at:
      row.recorded_at ||
      row.ts ||
      row.device_recorded_at ||
      row.created_at ||
      row.updated_at ||
      null,
  };
}

function getStoredOrgId() {
  if (typeof window === "undefined") return null;

  const directKeys = [
    "currentOrgId",
    "current_org_id",
    "orgId",
    "org_id",
    "selectedOrgId",
    "selected_org_id",
  ];

  for (const key of directKeys) {
    const value = window.localStorage.getItem(key) || window.sessionStorage.getItem(key);
    if (value && value !== "undefined" && value !== "null") return value.replaceAll('"', "");
  }

  for (const storage of [window.localStorage, window.sessionStorage]) {
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (!key) continue;
      const value = storage.getItem(key);
      if (!value) continue;

      try {
        const parsed = JSON.parse(value);
        const candidate =
          parsed?.currentOrgId ||
          parsed?.current_org_id ||
          parsed?.orgId ||
          parsed?.org_id ||
          parsed?.currentOrg?.id ||
          parsed?.organization?.id ||
          parsed?.org?.id;
        if (candidate) return String(candidate);
      } catch {
        // ignore non-json storage values
      }
    }
  }

  return null;
}

async function resolveOrgId(userId) {
  const stored = getStoredOrgId();
  if (stored) return stored;

  const attempts = [
    () =>
      supabase
        .from("organizations")
        .select("id")
        .eq("owner_id", userId)
        .eq("active", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
    () =>
      supabase
        .from("organizations")
        .select("id")
        .eq("created_by", userId)
        .eq("active", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
    () =>
      supabase
        .from("org_members")
        .select("org_id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle(),
    () =>
      supabase
        .from("organization_members")
        .select("org_id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle(),
  ];

  for (const attempt of attempts) {
    try {
      const { data, error } = await attempt();
      if (!error && (data?.id || data?.org_id)) return data.id || data.org_id;
    } catch {
      // try next source
    }
  }

  return null;
}

export default function TrackerDashboard() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [orgId, setOrgId] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        const token = session?.access_token;
        const userId = session?.user?.id;

        if (!token || !userId) {
          throw new Error("No hay sesión activa para consultar trackers.");
        }

        const resolvedOrgId = await resolveOrgId(userId);

        if (!resolvedOrgId) {
          throw new Error("No se pudo resolver la organización activa.");
        }

        const params = new URLSearchParams({
          action: "report",
          org_id: resolvedOrgId,
          from: DEFAULT_FROM,
          to: new Date().toISOString(),
        });

        const res = await fetch(`/api/reportes?${params.toString()}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        });

        const text = await res.text();
        let payload = null;

        try {
          payload = text ? JSON.parse(text) : null;
        } catch {
          throw new Error(`Respuesta no JSON desde /api/reportes: ${text.slice(0, 120)}`);
        }

        if (!res.ok) {
          throw new Error(payload?.error || payload?.message || `API error ${res.status}`);
        }

        const safeRows = normalizeRows(payload)
          .map(normalizeTrackerRow)
          .filter(Boolean);

        if (!cancelled) {
          setOrgId(resolvedOrgId);
          setRows(safeRows);
        }
      } catch (err) {
        console.error("Error loading tracker data", err);
        if (!cancelled) {
          setRows([]);
          setError(err?.message || "No se pudieron cargar los trackers.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    const timer = window.setInterval(load, 30000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const latestRows = useMemo(() => {
    const byUser = new Map();

    for (const row of Array.isArray(rows) ? rows : []) {
      if (!row?.user_id) continue;
      byUser.set(row.user_id, row);
    }

    return Array.from(byUser.values());
  }, [rows]);

  if (loading) {
    return <div style={{ padding: 20 }}>Cargando trackers...</div>;
  }

  if (error) {
    return (
      <div style={{ padding: 20 }}>
        <h3>No se pudieron cargar los trackers</h3>
        <p>{error}</p>
      </div>
    );
  }

  if (!latestRows.length) {
    return (
      <div style={{ padding: 20 }}>
        <h3>No hay datos de trackers</h3>
        {orgId ? <p>Organización: {orgId}</p> : null}
      </div>
    );
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>Trackers activos: {latestRows.length}</h2>
      {orgId ? <p>Organización: {orgId}</p> : null}

      <ul>
        {latestRows.map((r) => (
          <li key={r.user_id}>
            {r.user_id} → {r.lat ?? "sin lat"}, {r.lng ?? "sin lng"}
            {r.recorded_at ? ` · ${new Date(r.recorded_at).toLocaleString()}` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}
