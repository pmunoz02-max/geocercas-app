// api/reportes.js
import { createClient } from "@supabase/supabase-js";

/**
 * Auth UNIVERSAL:
 * - Cookie-first: tg_at (HttpOnly)
 * - Fallback: Authorization: Bearer <token>
 *
 * Env UNIVERSAL (server):
 * - SUPABASE_URL / SUPABASE_ANON_KEY
 *   o VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
 *   o NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
 */

function getEnv(nameList) {
  for (const n of nameList) {
    const v = process.env[n];
    if (v && String(v).trim()) return String(v).trim();
  }
  return null;
}

function parseCookie(cookieHeader, key) {
  if (!cookieHeader) return null;
  const m = cookieHeader.match(new RegExp(`(?:^|;\\s*)${key}=([^;]+)`));
  if (!m || !m[1]) return null;

  // No confiar en decodeURIComponent: puede fallar si viene mal encoded
  const raw = m[1];
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw; // fallback seguro
  }
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const SUPABASE_URL = getEnv([
      "SUPABASE_URL",
      "VITE_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_URL",
    ]);

    const SUPABASE_ANON_KEY = getEnv([
      "SUPABASE_ANON_KEY",
      "SUPABASE_ANON_PUBLIC",
      "VITE_SUPABASE_ANON_KEY",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    ]);

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return res.status(500).json({
        error:
          "Server misconfigured: missing Supabase env vars (SUPABASE_URL / SUPABASE_ANON_KEY)",
        details: {
          hasUrl: Boolean(SUPABASE_URL),
          hasAnonKey: Boolean(SUPABASE_ANON_KEY),
        },
      });
    }

    // 1) token cookie-first
    const cookieHeader = req.headers.cookie || "";
    let token = parseCookie(cookieHeader, "tg_at");

    // 2) fallback bearer
    if (!token) {
      const authHeader = req.headers.authorization || "";
      if (authHeader.toLowerCase().startsWith("bearer ")) {
        token = authHeader.slice(7);
      }
    }

    if (!token) {
      return res.status(401).json({
        error: "Missing authentication (cookie tg_at or Authorization Bearer)",
      });
    }

    // Supabase client as user (RLS applies)
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: { Authorization: `Bearer ${token}` },
      },
      auth: { persistSession: false },
    });

    const action = String(req.query.action || "").toLowerCase();

    if (action === "geocercas") {
      const { data, error } = await supabase
        .from("geocercas")
        .select("id, nombre")
        .order("nombre", { ascending: true });

      if (error) {
        return res.status(400).json({
          error: error.message,
          hint: "RLS/permiso o tabla geocercas no accesible para este usuario/org",
        });
      }

      return res.status(200).json({ data: data || [] });
    }

    if (action === "attendance") {
      const start = req.query.start ? String(req.query.start) : "";
      const end = req.query.end ? String(req.query.end) : "";
      const geocercaName = req.query.geocerca_name
        ? String(req.query.geocerca_name)
        : "";

      if (start && end && start > end) {
        return res.status(400).json({
          error: 'La fecha "Desde" no puede ser mayor que "Hasta".',
        });
      }

      // end inclusivo -> exclusive (+1 día)
      const buildDateRangeForDates = (startStr, endStr) => {
        let fromDate = null;
        let toDateExclusive = null;

        if (startStr) fromDate = startStr;

        if (endStr) {
          const d = new Date(endStr + "T00:00:00");
          if (!Number.isNaN(d.getTime())) {
            d.setDate(d.getDate() + 1);
            toDateExclusive = d.toISOString().slice(0, 10);
          }
        }
        return { fromDate, toDateExclusive };
      };

      const { fromDate, toDateExclusive } = buildDateRangeForDates(start, end);

      let query = supabase.from("v_attendance_daily").select("*");
      if (fromDate) query = query.gte("work_day", fromDate);
      if (toDateExclusive) query = query.lt("work_day", toDateExclusive);
      if (geocercaName) query = query.eq("geofence_name", geocercaName);

      const { data, error } = await query.order("work_day", { ascending: false });

      if (error) {
        return res.status(400).json({
          error: error.message,
          hint:
            "Revisa v_attendance_daily (org_id + get_current_org_id) y/o RLS en attendances/geocercas",
        });
      }

      return res.status(200).json({ data: data || [] });
    }

    return res.status(400).json({
      error: "Invalid action. Use action=geocercas or action=attendance",
    });
  } catch (e) {
    console.error("[api/reportes] fatal:", e);
    return res.status(500).json({
      error: "Unexpected server error",
      details: e?.message || String(e),
    });
  }
}
