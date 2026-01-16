// api/reportes.js
import { createClient } from "@supabase/supabase-js";

/**
 * Autenticación UNIVERSAL:
 * - Primaria: cookie HttpOnly (tg_at)
 * - Secundaria (fallback): Authorization Bearer
 *
 * Endpoints:
 * - GET /api/reportes?action=geocercas
 * - GET /api/reportes?action=attendance&start=YYYY-MM-DD&end=YYYY-MM-DD&geocerca_name=...
 */

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return res.status(500).json({
        error: "Missing SUPABASE_URL or SUPABASE_ANON_KEY",
      });
    }

    // ============================
    // 1) Resolver token (cookie-first)
    // ============================
    let token = null;

    // A) Cookie HttpOnly (tg_at)
    const cookieHeader = req.headers.cookie || "";
    const match = cookieHeader.match(/(?:^|;\s*)tg_at=([^;]+)/);
    if (match && match[1]) {
      token = decodeURIComponent(match[1]);
    }

    // B) Fallback: Authorization Bearer
    if (!token) {
      const authHeader = req.headers.authorization || "";
      if (authHeader.toLowerCase().startsWith("bearer ")) {
        token = authHeader.slice(7);
      }
    }

    if (!token) {
      return res.status(401).json({
        error: "Missing authentication (cookie or bearer token)",
      });
    }

    // ============================
    // 2) Supabase client "as user"
    // ============================
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      auth: { persistSession: false },
    });

    const action = String(req.query.action || "").toLowerCase();

    // ============================
    // 3) Endpoints
    // ============================
    if (action === "geocercas") {
      const { data, error } = await supabase
        .from("geocercas")
        .select("id, nombre")
        .order("nombre", { ascending: true });

      if (error) {
        return res.status(400).json({ error: error.message });
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

      // rango inclusivo hasta
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

      const { fromDate, toDateExclusive } =
        buildDateRangeForDates(start, end);

      let query = supabase.from("v_attendance_daily").select("*");

      if (fromDate) query = query.gte("work_day", fromDate);
      if (toDateExclusive) query = query.lt("work_day", toDateExclusive);
      if (geocercaName) query = query.eq("geofence_name", geocercaName);

      const { data, error } = await query.order("work_day", {
        ascending: false,
      });

      if (error) {
        return res.status(400).json({ error: error.message });
      }

      return res.status(200).json({ data: data || [] });
    }

    return res.status(400).json({
      error: "Invalid action. Use action=geocercas or action=attendance",
    });
  } catch (e) {
    console.error("[api/reportes] error:", e);
    return res.status(500).json({
      error: e?.message || "Unexpected server error",
    });
  }
}
