import { useEffect, useMemo, useState } from "react";
import { createAsignacion, getAsignacionesBundle, listAsignaciones } from "../lib/asignacionesApi";
import { useAuth } from "@/context/auth.js";

export default function AsignacionesPage() {
  const { activeOrgId } = useAuth();

  const [personas, setPersonas] = useState([]);
  const [geocercas, setGeocercas] = useState([]);
  const [actividades, setActividades] = useState([]);
  const [asignaciones, setAsignaciones] = useState([]);

  const [selectedPersonId, setSelectedPersonId] = useState("");
  const [selectedGeocercaId, setSelectedGeocercaId] = useState("");
  const [selectedActivityId, setSelectedActivityId] = useState("");

  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  const [status, setStatus] = useState("active");
  const [freqMin, setFreqMin] = useState(5);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!activeOrgId) return;
    loadAll();
  }, [activeOrgId]);

  return (
    <div className="p-4 max-w-3xl">
      <h2 className="text-xl font-semibold mb-4">Nueva asignación</h2>

      {/* mensaje si no hay personas */}
      {personasDisponibles.length === 0 && (
        <div className="mb-4 text-red-600">No hay personas disponibles para esta organización.</div>
      )}

      {/* selector de persona */}
      {personasDisponibles.length > 0 && (
        <select
          className="w-full border p-2 rounded mb-2"
          value={selectedPersonId}
          onChange={(e) => {
            setSelectedPersonId(e.target.value);
            setError("");
            setSuccess("");
          }}
        >
          <option value="">Seleccionar persona</option>
          {personasDisponibles.map((p) => {
            const personaId = p.id || p.personal_id;
            const visible =
              p.full_name
                || [p.nombre, p.apellido].filter(Boolean).join(" ")
                || p.email
                || `Persona ${personaId}`;
            return (
              <option key={personaId} value={personaId}>
                {visible}{!p.user_id ? " — sin tracker" : ""}
              </option>
            );
          })}
        </select>
      )}

      {/* warning de tracker faltante */}
      {selectedPersonId && personasDisponibles.length > 0 && (() => {
        const persona = personasDisponibles.find(p => (p.id || p.personal_id) === selectedPersonId);
        return persona && !persona.user_id ? (
          <div className="mb-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Esta persona aún no tiene tracker vinculado. La asignación se guardará, pero el tracking no se activará hasta vincular un usuario/tracker.
          </div>
        ) : null;
      })()}

      {/* selector de geocerca */}
      <select
        className="w-full border p-2 rounded mb-2"
        value={selectedGeocercaId}
        onChange={(e) => setSelectedGeocercaId(e.target.value)}
        disabled={geocercas.length === 0}
      >
        <option value="">Seleccionar geocerca</option>
        {geocercas.map((g) => {
          const nombre = g.name || g.nombre || g.title || g.id;
          return (
            <option key={g.id} value={g.id}>
              {nombre}
            </option>
          );
        })}
      </select>

      {/* mensaje si no hay geocercas */}
      {geocercas.length === 0 && (
        <div className="mb-4 text-red-600">No hay geocercas disponibles para esta organización.</div>
      )}

      {/* selector de actividad */}
      <select
        className="w-full border p-2 rounded mb-2"
        value={selectedActivityId}
        onChange={(e) => setSelectedActivityId(e.target.value)}
        disabled={actividades.length === 0}
      >
        <option value="">Seleccionar actividad</option>
        {actividades.map((a) => {
          const nombre = a.name || a.nombre || a.title || a.id;
          return (
            <option key={a.id} value={a.id}>
              {nombre}
            </option>
          );
        })}
      </select>

      {/* mensaje si no hay actividades */}
      {actividades.length === 0 && (
        <div className="mb-4 text-red-600">No hay actividades disponibles para esta organización.</div>
      )}

      {/* fecha/hora inicio */}
      <input
        type="datetime-local"
        className="w-full border p-2 rounded mb-2"
        value={startTime}
        onChange={(e) => setStartTime(e.target.value)}
      />

      {/* fecha/hora fin */}
      <input
        type="datetime-local"
        className="w-full border p-2 rounded mb-2"
        value={endTime}
        onChange={(e) => setEndTime(e.target.value)}
      />

      {/* estado */}
      <select
        className="w-full border p-2 rounded mb-2"
        value={status}
        onChange={(e) => setStatus(e.target.value)}
      >
        <option value="active">Activa</option>
        <option value="inactive">Inactiva</option>
        // Paso 10: personas prioridad y normalización
        const rawPersonas = catalogs.personal || catalogs.people || [];
        const normalizedPersonas = (rawPersonas || []).map((p) => ({
          ...p,
          id: p?.id ?? p?.personal_id ?? p?.org_people_id ?? null,
          personal_id: p?.personal_id ?? p?.id ?? p?.org_people_id ?? null,
          nombre: p?.nombre ?? p?.name ?? p?.first_name ?? "",
          apellido: p?.apellido ?? p?.last_name ?? "",
          full_name: p?.full_name ?? [p?.nombre ?? p?.name ?? p?.first_name ?? "", p?.apellido ?? p?.last_name ?? ""].filter(Boolean).join(" "),
        }));
        setPersonas(normalizedPersonas);

      {/* frecuencia */}
      <input
        type="number"
        className="w-full border p-2 rounded mb-2"
        value={freqMin}
        min={1}
        onChange={(e) => setFreqMin(e.target.value)}
      />

      const personasDisponibles = (personas || []).filter(
        (p) => {
          if (!p) return false;
          const id = p.id ?? p.personal_id;
          return !!id;
        }
      );
        className="bg-blue-600 text-white px-4 py-2 rounded"
        onClick={handleSubmit}
      >
        Guardar asignación
      </button>
    </div>
  );
          );
        })}
      </select>

      {/* Mensaje si no hay actividades */}
      {actividades.length === 0 && (
        <div className="mb-4 text-red-600">No hay actividades disponibles para esta organización.</div>
      )}

      {/* Fecha/hora inicio */}
      <input
        type="datetime-local"
        className="w-full border p-2 rounded mb-2"
        value={startTime}
        onChange={(e) => setStartTime(e.target.value)}
      />

      {/* Fecha/hora fin */}
      <input
        type="datetime-local"
        className="w-full border p-2 rounded mb-2"
        value={endTime}
        onChange={(e) => setEndTime(e.target.value)}
      />

      {/* Estado */}
      <select
        className="w-full border p-2 rounded mb-2"
        value={status}
        onChange={(e) => setStatus(e.target.value)}
      >
        <option value="active">Activa</option>
        <option value="inactive">Inactiva</option>
      </select>

      {/* Frecuencia (minutos) */}
      <input
        type="number"
        className="w-full border p-2 rounded mb-2"
        value={freqMin}
        min={1}
        onChange={(e) => setFreqMin(e.target.value)}
      />

      {/* error */}
      {error && <div className="text-red-600 mb-2">{error}</div>}

      {/* success */}
      {success && <div className="text-green-600 mb-2">{success}</div>}

      {/* botón Guardar asignación */}
      <button
        className="bg-blue-600 text-white px-4 py-2 rounded"
        onClick={handleSubmit}
      >
        Guardar asignación
      </button>

      {/* 4) Warning visible si la persona elegida no tiene tracker */}
      {selectedPersonId && personasDisponibles.length > 0 && (() => {
        const persona = personasDisponibles.find(p => (p.id || p.personal_id) === selectedPersonId);
        return persona && !persona.user_id ? (
          <div className="mb-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Esta persona aún no tiene tracker vinculado. La asignación se guardará, pero el tracking no se activará hasta vincular un usuario/tracker.
          </div>
        ) : null;
      })()}

      {/* 1) Warning visible si la persona no tiene tracker */}
      {showNoTrackerWarning && (
        <div className="mb-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Esta persona aún no tiene tracker vinculado. La asignación se guardará, pero el tracking no se activará hasta vincular un usuario/tracker.
        </div>
      )}

      {/* 3) Si geocercas está vacío, mostrar mensaje */}
      {geocercas.length === 0 ? (
        <div className="mb-4 text-red-600">No hay geocercas disponibles para esta organización.</div>
      ) : (
        <select
          className="w-full border p-2 rounded mb-2"
          value={selectedGeocercaId}
          onChange={(e) => setSelectedGeocercaId(e.target.value)}
        >
          <option value="">Seleccionar geocerca</option>
          {geocercas.map((g) => {
            const nombre = g.name || g.nombre || g.title || g.id;
            return (
              <option key={g.id} value={g.id}>
                {nombre}
              </option>
            );
          })}
        </select>
      )}

      {/* 4) Si actividades está vacío, mostrar mensaje */}
      {actividades.length === 0 ? (
        <div className="mb-4 text-red-600">No hay actividades disponibles para esta organización.</div>
      ) : (
        <select
          className="w-full border p-2 rounded mb-2"
          value={selectedActivityId}
          onChange={(e) => setSelectedActivityId(e.target.value)}
        >
          <option value="">Seleccionar actividad</option>
          {actividades.map((a) => {
            const nombre = a.name || a.nombre || a.title || a.id;
            return (
              <option key={a.id} value={a.id}>
                {nombre}
              </option>
            );
          })}
        </select>
      )}

      {/* 4) Input datetime-local para startTime */}
      <input
        type="datetime-local"
        className="w-full border p-2 rounded mb-2"
        value={startTime}
        onChange={(e) => setStartTime(e.target.value)}
      />

      {/* 5) Input datetime-local para endTime */}
      <input
        type="datetime-local"
        className="w-full border p-2 rounded mb-2"
        value={endTime}
        onChange={(e) => setEndTime(e.target.value)}
      />

      {/* 6) Select de status */}
      <select
        className="w-full border p-2 rounded mb-2"
        value={status}
        onChange={(e) => setStatus(e.target.value)}
      >
        <option value="active">Activa</option>
        <option value="inactive">Inactiva</option>
      </select>

      {/* 7) Input number para freqMin */}
      <input
        type="number"
        className="w-full border p-2 rounded mb-2"
        value={freqMin}
        min={1}
        onChange={(e) => setFreqMin(e.target.value)}
      />

      {/* 8) Mensajes de error y success */}
      {error && <div className="text-red-600 mb-2">{error}</div>}
      {success && <div className="text-green-600 mb-2">{success}</div>}

      {/* 9) Botón Guardar asignación */}
      <button
        className="bg-blue-600 text-white px-4 py-2 rounded"
        onClick={handleSubmit}
      >
        Guardar asignación
      </button>

      {showNoTrackerWarning && (
        <div className="text-yellow-600 text-sm mb-2">
          Sin tracker → no habrá tracking aún
        </div>
      )}

      <button
        onClick={handleSubmit}
        className="bg-blue-600 text-white px-4 py-2 rounded"
      >
        Guardar asignación
      </button>

      {error && <div className="text-red-500">{error}</div>}
      {success && <div className="text-green-500">{success}</div>}
    </div>
  );
}