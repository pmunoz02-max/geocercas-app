import React, { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Polygon, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "@geoman-io/leaflet-geoman-free";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import { Link } from "react-router-dom";
import { getSupabase } from "../../lib/supabaseClient.js";

export default function GeocercasV2() {
  const mapRef = useRef(null);
  const [geocercas, setGeocercas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState("ok");
  const [editing, setEditing] = useState(null); // { id, layer }
  const supabase = getSupabase();

  const notify = (text, type = "ok", ms = 3500) => {
    setMsg(text);
    setMsgType(type);
    clearTimeout(window.__geoc_msg_to);
    window.__geoc_msg_to = setTimeout(() => setMsg(""), ms);
  };

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("geocercas")
      .select("id,nombre,descripcion,coordenadas,activa,created_at")
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      notify("❌ No se pudo cargar la lista", "error");
      setGeocercas([]);
    } else {
      setGeocercas(Array.isArray(data) ? data : []);
      setTimeout(() => {
        const b = allGeosToBounds(data || []);
        if (b && mapRef.current) mapRef.current.fitBounds(b, { padding: [40, 40] });
      }, 150);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  /* ---------- Crear desde dibujo ---------- */
  const handleSavePolygon = async (latLngRing) => {
    const ring = normalizeLatLngs(latLngRing);
    if (!ring || ring.length < 3) {
      notify("❌ Dibuja un polígono válido.", "error");
      return;
    }
    const nombre = prompt("Nombre de la geocerca:");
    if (!nombre) return;

    const coords = ring.map((p) => ({ lat: +p.lat, lng: +p.lng }));
    const { error } = await supabase
      .from("geocercas")
      .insert({ nombre, coordenadas: coords, activa: false });

    if (error) {
      console.error(error);
      notify("❌ Error al guardar", "error");
      return;
    }
    notify("✅ Geocerca guardada.");
    await load();
  };

  /* ---------- Crear manual ---------- */
  const handleSaveManual = async ({ nombre, texto }) => {
    const parsed = parseManualCoords(texto);
    if (!nombre || parsed.length < 3) {
      notify("❌ Revisa nombre y al menos 3 coordenadas válidas.", "error");
      return;
    }
    const { error } = await supabase
      .from("geocercas")
      .insert({ nombre, coordenadas: parsed, activa: false });
    if (error) {
      console.error(error);
      notify("❌ No se pudo guardar la geocerca", "error");
      return;
    }
    notify("✅ Geocerca creada (manual).");
    await load();
  };

  /* ---------- Activar/Desactivar ---------- */
  const toggleActiva = async (g) => {
    const { error } = await supabase
      .from("geocercas")
      .update({ activa: !g.activa })
      .eq("id", g.id);
    if (error) {
      console.error(error);
      notify("❌ No se pudo cambiar estado", "error");
      return;
    }
    notify(`✅ ${!g.activa ? "Activada" : "Desactivada"}`);
    await load();
  };

  /* ---------- Eliminar ---------- */
  const eliminar = async (g) => {
    if (!confirm(`¿Eliminar "${g.nombre}"?`)) return;
    const { error } = await supabase.from("geocercas").delete().eq("id", g.id);
    if (error) {
      notify("❌ No se pudo eliminar", "error");
      return;
    }
    notify("🗑️ Eliminada.");
    await load();
  };

  /* ---------- Ver ---------- */
  const verEnMapa = (g) => {
    const coords = safeCoordsFromJSON(g.coordenadas);
    if (!coords || coords.length < 3) {
      notify("⚠️ Geocerca sin coordenadas válidas", "error");
      return;
    }
    const b = L.latLngBounds(coords);
    mapRef.current && mapRef.current.fitBounds(b, { padding: [40, 40] });
  };

  const mostrarTodas = () => {
    const b = allGeosToBounds(geocercas);
    if (b && mapRef.current) mapRef.current.fitBounds(b, { padding: [40, 40] });
  };

  /* ---------- Editar (texto) ---------- */
  const editarTexto = async (g) => {
    const nuevoNombre =
      prompt("Nuevo nombre (deja igual si no quieres cambiar):", g.nombre) ??
      g.nombre;
    const actualTxt = (Array.isArray(g.coordenadas) ? g.coordenadas : [])
      .map((p) => `${p.lat},${p.lng}`)
      .join("\n");
    const nuevoTxt = prompt(
      "Edita coordenadas (lat,lng por línea). Deja en blanco para mantener:",
      actualTxt
    );

    let update = { nombre: nuevoNombre };
    if (nuevoTxt !== null) {
      const parsed = parseManualCoords(nuevoTxt);
      if (parsed.length < 3) {
        notify("❌ Se requieren al menos 3 puntos válidos.", "error");
        return;
      }
      update.coordenadas = parsed;
    }
    const { error } = await supabase
      .from("geocercas")
      .update(update)
      .eq("id", g.id);
    if (error) {
      console.error(error);
      notify("❌ No se pudo editar", "error");
      return;
    }
    notify("✏️ Geocerca actualizada.");
    await load();
  };

  /* ---------- Editar EN MAPA ---------- */
  const editarEnMapa = (g) => {
    if (!mapRef.current) return;
    const coords = safeCoordsFromJSON(g.coordenadas);
    if (!coords) {
      notify("❌ Coordenadas inválidas.", "error");
      return;
    }

    if (editing?.layer) {
      try { editing.layer.remove(); } catch {}
    }

    const layer = L.polygon(coords, {
      color: "orange",
      weight: 3,
      fillOpacity: 0.15,
    }).addTo(mapRef.current);
    mapRef.current.fitBounds(layer.getBounds(), { padding: [30, 30] });
    try { layer.pm && layer.pm.enable({ allowSelfIntersection: false }); } catch {}
    setEditing({ id: g.id, layer });
    notify("🟠 Edición en mapa activa. Ajusta vértices y pulsa 'Guardar cambios'.", "ok", 5000);
  };

  const cancelarEdicionMapa = () => {
    if (editing?.layer) { try { editing.layer.remove(); } catch {} }
    setEditing(null);
    notify("Edición cancelada.");
  };

  const guardarEdicionMapa = async () => {
    if (!editing?.layer) return;
    const raw =
      typeof editing.layer.getLatLngs === "function"
        ? editing.layer.getLatLngs()
        : null;
    const ring = normalizeLatLngs(raw);
    if (!ring || ring.length < 3) {
      notify("❌ Polígono inválido.", "error");
      return;
    }

    const coords = ring.map((p) => ({ lat: Number(p.lat), lng: Number(p.lng) }));
    const { error } = await supabase
      .from("geocercas")
      .update({ coordenadas: coords })
      .eq("id", editing.id);
    if (error) {
      console.error(error);
      notify("❌ No se pudo guardar la edición", "error");
      return;
    }

    try { editing.layer.remove(); } catch {}
    setEditing(null);
    notify("✅ Cambios guardados.");
    await load();
  };

  return (
    <div className="min-h-screen p-6 md:p-10 space-y-6">
      <header className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Geocercas (V2)</h2>
        <div className="flex gap-2">
          <button onClick={mostrarTodas} className="rounded-lg border px-4 py-2 hover:bg-gray-50">Mostrar todas</button>
          <Link to="/admin" className="rounded-lg border px-4 py-2 hover:bg-gray-50">← Volver</Link>
        </div>
      </header>

      {msg && (
        <div className={`rounded-lg p-2 text-sm ${msgType === "error" ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"}`}>
          {msg}
        </div>
      )}

      {/* MAPA */}
      <div className="rounded-2xl border overflow-hidden relative" style={{ height: "520px" }}>
        <MapContainer
          center={[-0.1807, -78.4678]}
          zoom={12}
          style={{ height: "100%", width: "100%" }}
          whenCreated={(m) => (mapRef.current = m)}
        >
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <MapEditor onSave={handleSavePolygon} />
          <LatLngControl />

          {/* Solo polígonos (sin marcadores) */}
          {geocercas.map((g) => {
            const coords = safeCoordsFromJSON(g.coordenadas);
            if (!coords) return null;
            return (
              <Polygon
                key={g.id}
                positions={coords}
                pathOptions={{ color: g.activa ? "green" : "blue", weight: 2, fillOpacity: 0.25 }}
              />
            );
          })}
        </MapContainer>

        {/* Botones flotantes para edición en mapa */}
        {editing && (
          <div className="absolute top-3 right-3 flex gap-2">
            <button onClick={guardarEdicionMapa} className="rounded bg-green-600 text-white px-3 py-1 text-sm">
              Guardar cambios
            </button>
            <button onClick={cancelarEdicionMapa} className="rounded bg-white border px-3 py-1 text-sm">
              Cancelar
            </button>
          </div>
        )}
      </div>

      {/* Formulario manual */}
      <ManualForm onSave={handleSaveManual} />

      {/* LISTADO */}
      <section className="rounded-xl border p-4">
        <h3 className="font-semibold mb-3">Geocercas guardadas</h3>
        {loading && <p>Cargando...</p>}
        {!loading && geocercas.length === 0 && <p>No hay geocercas.</p>}
        {!loading &&
          geocercas.map((g) => (
            <div key={g.id} className="py-2 flex flex-wrap items-center justify-between border-t first:border-t-0">
              <div>
                <div className="font-medium">{g.nombre}</div>
                <div className="text-xs text-gray-500">
                  {new Date(g.created_at).toLocaleString()} · {g.activa ? "Activa" : "Inactiva"}
                </div>
              </div>
              <div className="flex gap-2">
                <button className="text-blue-600 hover:underline" onClick={() => verEnMapa(g)}>Ver</button>
                <button className={`rounded px-3 py-1 text-sm border ${g.activa ? "bg-green-600 text-white" : "bg-white"}`} onClick={() => toggleActiva(g)}>
                  {g.activa ? "Desactivar" : "Activar"}
                </button>
                <button className="rounded px-3 py-1 text-sm border" onClick={() => editarTexto(g)}>Editar</button>
                <button className="rounded px-3 py-1 text-sm border" onClick={() => editarEnMapa(g)}>Editar en mapa</button>
                <button className="rounded px-3 py-1 text-sm border text-red-700" onClick={() => eliminar(g)}>Eliminar</button>
              </div>
            </div>
          ))}
      </section>
    </div>
  );
}

/* ===================== SUBCOMPONENTES ===================== */

function MapEditor({ onSave }) {
  const map = useMap();
  useEffect(() => {
    map.pm.addControls({
      position: "topleft",
      drawPolygon: true,
      drawMarker: false,
      drawCircle: false,
      drawPolyline: false,
      editMode: true,
      removalMode: true,
    });

    const onCreate = (e) => {
      try {
        const layer = e.layer;
        const raw = typeof layer.getLatLngs === "function" ? layer.getLatLngs() : null;
        const ring = normalizeLatLngs(raw);
        if (!ring || ring.length < 3) { layer.remove(); return; }
        onSave(ring);
      } catch (err) {
        console.error("pm:create error:", err);
      } finally {
        try { e.layer.remove(); } catch {}
      }
    };

    map.on("pm:create", onCreate);
    return () => { map.off("pm:create", onCreate); map.pm.removeControls(); };
  }, [map, onSave]);
  return null;
}

/* Control Lat/Lng en vivo */
function LatLngControl() {
  const map = useMap();
  useEffect(() => {
    const ctrl = L.control({ position: "bottomleft" });
    let div;
    ctrl.onAdd = function () {
      div = L.DomUtil.create("div", "leaflet-control");
      div.style.padding = "4px 8px";
      div.style.background = "rgba(255,255,255,0.95)";
      div.style.border = "1px solid #e5e7eb";
      div.style.borderRadius = "8px";
      div.style.fontSize = "12px";
      div.textContent = "Mover cursor para ver Lat/Lng";
      return div;
    };
    ctrl.addTo(map);
    const onMove = (e) => { if (div) div.textContent = `Lat: ${e.latlng.lat.toFixed(6)} · Lng: ${e.latlng.lng.toFixed(6)}`; };
    map.on("mousemove", onMove);
    return () => { map.off("mousemove", onMove); ctrl.remove(); };
  }, [map]);
  return null;
}

/* Formulario de ingreso manual */
function ManualForm({ onSave }) {
  const [nombre, setNombre] = useState("");
  const [texto, setTexto] = useState("");

  const submit = (e) => {
    e.preventDefault();
    onSave({ nombre: nombre.trim(), texto });
    setNombre("");
    setTexto("");
  };

  return (
    <form onSubmit={submit} className="rounded-xl border p-4 space-y-3">
      <h3 className="font-semibold">Crear geocerca manualmente</h3>
      <div className="grid gap-3 md:grid-cols-2">
        <input
          className="border rounded-lg px-3 py-2 w-full"
          placeholder="Nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          required
        />
        <div className="text-sm text-gray-500 md:text-right">
          Formato: <code>lat,lng</code> por línea. Mínimo 3 líneas.
        </div>
      </div>
      <textarea
        className="border rounded-lg px-3 py-2 w-full h-28 font-mono text-sm"
        placeholder={"-0.1807,-78.4678\n-0.1820,-78.4600\n-0.1850,-78.4650"}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
      />
      <button type="submit" className="rounded-lg bg-blue-600 text-white px-4 py-2 font-medium">
        Guardar manual
      </button>
    </form>
  );
}

/* ===================== HELPERS ===================== */

function normalizeLatLngs(latlngs) {
  if (!latlngs) return null;
  if (Array.isArray(latlngs) && Array.isArray(latlngs[0]) && latlngs[0][0]?.lat !== undefined)
    return latlngs[0]; // ring exterior
  if (Array.isArray(latlngs) && latlngs[0]?.lat !== undefined) return latlngs;
  if (Array.isArray(latlngs) && Array.isArray(latlngs[0]) && Array.isArray(latlngs[0][0])) {
    const ring = latlngs[0][0]; // rectángulo
    return Array.isArray(ring) ? ring : null;
  }
  return null;
}

function safeCoordsFromJSON(jsonVal) {
  try {
    if (!jsonVal) return null;
    const arr = Array.isArray(jsonVal) ? jsonVal : JSON.parse(jsonVal);
    if (!Array.isArray(arr) || arr.length < 3) return null;
    const pts = arr
      .map(normalizePointLike)
      .filter(Boolean)
      .map(([lat, lng]) => [Number(lat), Number(lng)])
      .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
    return pts.length >= 3 ? pts : null;
  } catch {
    return null;
  }
}

function normalizePointLike(p) {
  if (p == null) return null;
  if (typeof p === "object" && !Array.isArray(p)) {
    const lat = p.lat ?? p.latitude ?? p.latitud ?? p.y ?? p.Lat ?? p.Latitude;
    const lng =
      p.lng ?? p.long ?? p.lon ?? p.longitude ?? p.longitud ?? p.x ?? p.Lng ?? p.Longitude;
    if (lat != null && lng != null) return fixOrder([Number(lat), Number(lng)]);
  }
  if (Array.isArray(p) && p.length >= 2) return fixOrder([Number(p[0]), Number(p[1])]);
  if (typeof p === "string") {
    const parts = p.split(/[,\s]+/).slice(0, 2).map(Number);
    if (parts.length === 2 && parts.every(Number.isFinite)) return fixOrder([parts[0], parts[1]]);
  }
  return null;
}

function fixOrder([a, b]) {
  const looksLat = (v) => Math.abs(v) <= 90;
  const looksLng = (v) => Math.abs(v) <= 180;
  if (looksLat(a) && looksLng(b)) return [a, b];
  if (looksLat(b) && looksLng(a)) return [b, a];
  if (a < -75 && a > -92 && Math.abs(b) < 2) return [b, a]; // heurística Ecuador
  if (b < -75 && b > -92 && Math.abs(a) < 2) return [a, b];
  return [a, b];
}

function allGeosToBounds(geos) {
  const pts = [];
  (geos || []).forEach((g) => {
    const c = safeCoordsFromJSON(g.coordenadas);
    if (c) pts.push(...c);
  });
  return pts.length ? L.latLngBounds(pts) : null;
}

function parseManualCoords(text) {
  return String(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/[,\s]+/).slice(0, 2).map((x) => Number(x)))
    .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng))
    .map(([lat, lng]) => ({ lat, lng }));
}
