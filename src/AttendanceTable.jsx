import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";

export default function AttendanceTable() {
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
      <h2>📋 Registro de asistencias</h2>
      <table border="1" cellPadding="6" style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead style={{ backgroundColor: "#f2f2f2" }}>
          <tr>
            <th>Usuario</th>
            <th>Geocerca</th>
            <th>Evento</th>
            <th>Fecha y hora</th>
          </tr>
        </thead>
        <tbody>
          {events.length === 0 ? (
            <tr>
              <td colSpan="4" style={{ textAlign: "center" }}>Sin registros</td>
            </tr>
          ) : (
            events.map((e, idx) => (
              <tr key={idx}>
                <td>{e.user_email}</td>
                <td>{e.geofence_name}</td>
                <td>{e.event_kind === "check_in" ? "✅ Entrada" : "🚪 Salida"}</td>
                <td>{new Date(e.last_timestamp).toLocaleString()}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <button onClick={fetchAttendance} style={{ marginTop: "10px" }}>
        🔄 Actualizar
      </button>
    </div>
  );
}
