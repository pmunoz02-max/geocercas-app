// src/components/geocercas/GeofenceList.jsx
import Toggle from "../ui/Toggle";
import Badge from "../ui/Badge";
import { useTranslation } from "react-i18next";


export default function GeofenceList({ items, onZoom, onToggleVisible, onToggleActive, onEditLinks, onDelete }) {
  const { t } = useTranslation();
return (
<div className="space-y-2">
{items.map((g) => (
<div key={g.id} className="rounded-lg border p-2 md:p-3 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
<div className="min-w-0">
<div className="font-medium truncate">{g.nombre}</div>
<div className="mt-1 flex items-center gap-2 text-xs text-gray-600">
<Badge>{g.activa ? t("common.states.active") : t("common.states.inactive")}</Badge>
<Badge>{g.visible ? t("common.states.visible") : t("common.states.hidden")}</Badge>
<span>{t("geofences.labels.personal")} {g.personal_ids?.length || 0}</span>
<span>{t("geofences.labels.assignments")} {g.asignacion_ids?.length || 0}</span>
</div>
</div>
<div className="shrink-0 flex flex-wrap gap-2 w-full md:w-auto">
<button className="px-2 py-1 text-xs md:text-sm rounded bg-gray-100" onClick={()=>onZoom?.(g)}>{t("common.zoom")}</button>
<Toggle label={t("common.states.visible")} checked={g.visible} onChange={(v)=>onToggleVisible?.(g, v)} />
<Toggle label={t("common.states.active")} checked={g.activa} onChange={(v)=>onToggleActive?.(g, v)} />
<button className="px-2 py-1 text-sm rounded bg-amber-100" onClick={()=>onEditLinks?.(g)}>{t("geofences.actions.links")}</button>
<button className="px-2 py-1 text-sm rounded bg-red-600 text-white" onClick={()=>onDelete?.(g)}>{t("common.delete")}</button>
</div>
</div>
))}
</div>
);
}