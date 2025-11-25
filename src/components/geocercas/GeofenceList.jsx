// src/components/geocercas/GeofenceList.jsx
import Toggle from "../ui/Toggle";
import Badge from "../ui/Badge";


export default function GeofenceList({ items, onZoom, onToggleVisible, onToggleActive, onEditLinks, onDelete }) {
return (
<div className="space-y-2">
{items.map((g) => (
<div key={g.id} className="rounded-lg border p-3 flex items-center justify-between gap-3">
<div className="min-w-0">
<div className="font-medium truncate">{g.nombre}</div>
<div className="mt-1 flex items-center gap-2 text-xs text-gray-600">
<Badge>{g.activa ? "Activa" : "Inactiva"}</Badge>
<Badge>{g.visible ? "Visible" : "Oculta"}</Badge>
<span>Personal: {g.personal_ids?.length || 0}</span>
<span>Asignaciones: {g.asignacion_ids?.length || 0}</span>
</div>
</div>
<div className="shrink-0 flex items-center gap-2">
<button className="px-2 py-1 text-sm rounded bg-gray-100" onClick={()=>onZoom?.(g)}>Zoom</button>
<Toggle label="Visible" checked={g.visible} onChange={(v)=>onToggleVisible?.(g, v)} />
<Toggle label="Activa" checked={g.activa} onChange={(v)=>onToggleActive?.(g, v)} />
<button className="px-2 py-1 text-sm rounded bg-amber-100" onClick={()=>onEditLinks?.(g)}>Vínculos</button>
<button className="px-2 py-1 text-sm rounded bg-red-600 text-white" onClick={()=>onDelete?.(g)}>Eliminar</button>
</div>
</div>
))}
</div>
);
}