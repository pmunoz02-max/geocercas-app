import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "./lib/supabase";

export default function AttendanceTable() {
  const { t } = useTranslation();
  const [events, setEvents] = useState([]);

  useEffect(() => {
    fetchAttendance();
  }, []);

  async function fetchAttendance() {
    const { data, error } = await supabase.from("v_attendance_last").select("*");
    if (error) console.error("Error al cargar asistencias:", error);
    else setEvents(data);
  }

  return (
    <div style={{ marginTop: "2rem" }}>
      <h2>📋 {t('tracker.attendance.title')}</h2>
      <table border="1" cellPadding="6" style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead style={{ backgroundColor: "#f2f2f2" }}>
          <tr>
            <th>{t('tracker.attendance.columns.user')}</th>
            <th>{t('tracker.attendance.columns.geofence')}</th>
            <th>{t('tracker.attendance.columns.event')}</th>
            <th>{t('tracker.attendance.columns.datetime')}</th>
          </tr>
        </thead>
        <tbody>
          {events.length === 0 ? (
            <tr>
              <td colSpan="4" style={{ textAlign: "center" }}>{t('tracker.attendance.noRecords')}</td>
            </tr>
          ) : (
            events.map((e, idx) => (
              <tr key={idx}>
                <td>{e.user_email}</td>
                <td>{e.geofence_name}</td>
                <td>{e.event_kind === "check_in" ? t('tracker.attendance.checkIn') : t('tracker.attendance.checkOut')}</td>
                <td>{new Date(e.last_timestamp).toLocaleString()}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <button onClick={fetchAttendance} style={{ marginTop: "10px" }}>
        🔄 {t('common.refresh')}
      </button>
    </div>
  );
}
