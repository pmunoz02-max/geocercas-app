// src/components/geocercas/CoordinatesModal.jsx
function parseInput() {
// 1) Intentar como GeoJSON
try {
const gj = JSON.parse(raw);
return { type: "geojson", nombre, geojson: gj };
} catch {}


// 2) Pares Lat,Lng (una por línea o separadas por ;)
const text = raw
.replace(/;/g, "\n")
.split(/\n+/)
.map((l) => l.trim())
.filter(Boolean);
const coords = [];
for (const line of text) {
const parts = line.split(/\s*,\s*/);
if (parts.length !== 2) throw new Error("Formato inválido en: " + line);
const lat = parseFloat(parts[0]);
const lng = parseFloat(parts[1]);
if (Number.isNaN(lat) || Number.isNaN(lng)) throw new Error("Lat/Lng inválidos en: " + line);
coords.push([lng, lat]); // GeoJSON usa [lng,lat]
}
if (coords.length < 3) throw new Error("Se requieren al menos 3 puntos");
return {
type: "pairs",
nombre,
geojson: {
type: "Feature",
properties: {},
geometry: {
type: "Polygon",
coordinates: [[...coords, coords[0]]],
},
},
};
}


function handleSave() {
try {
const parsed = parseInput();
onSubmit?.(parsed.nombre || "Geocerca manual", parsed.geojson);
} catch (e) {
alert(e.message);
}
}


return (
<div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
<div className="w-full max-w-2xl rounded-xl bg-white p-4 shadow">
<div className="flex items-center justify-between mb-3">
<h3 className="text-lg font-semibold">Crear por coordenadas / GeoJSON</h3>
<button className="text-sm px-2 py-1 rounded bg-gray-100" onClick={onClose}>Cerrar</button>
</div>
<div className="grid gap-3">
<input className="border rounded p-2" placeholder="Nombre de la geocerca" value={nombre} onChange={(e)=>setNombre(e.target.value)} />
<textarea className="border rounded p-2 h-48 font-mono text-xs" placeholder={`Ejemplos:\n- Lat,Lng por línea: -1.2345,-78.5678`} value={raw} onChange={(e)=>setRaw(e.target.value)} />
<div className="flex items-center justify-end gap-2">
<button className="px-3 py-2 rounded bg-gray-100" onClick={onClose}>Cancelar</button>
<button className="px-3 py-2 rounded bg-blue-600 text-white" onClick={handleSave}>Guardar</button>
</div>
</div>
</div>
</div>
);
}