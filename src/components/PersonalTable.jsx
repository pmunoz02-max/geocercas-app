// =============================================


if (!rows || rows.length === 0) {
return <div className="p-4">No hay personal activo.</div>
}


return (
<div className="overflow-x-auto rounded-2xl border">
<table className="min-w-full text-sm">
<thead className="bg-gray-50">
<tr className="text-left">
<th className="px-4 py-2">Nombre</th>
<th className="px-4 py-2">Apellido</th>
<th className="px-4 py-2">Email</th>
<th className="px-4 py-2">Teléfono</th>
<th className="px-4 py-2">Vigente</th>
<th className="px-4 py-2">Inicio</th>
<th className="px-4 py-2">Fin</th>
<th className="px-4 py-2"></th>
</tr>
</thead>
<tbody>
{rows.map((r) => (
<tr key={r.id} className="border-t hover:bg-gray-50">
<td className="px-4 py-2">{r.nombre}</td>
<td className="px-4 py-2">{r.apellido}</td>
<td className="px-4 py-2">{r.email}</td>
<td className="px-4 py-2">{r.telefono}</td>
<td className="px-4 py-2">{r.vigente ? 'Sí' : 'No'}</td>
<td className="px-4 py-2">{r.fecha_inicio || ''}</td>
<td className="px-4 py-2">{r.fecha_fin || ''}</td>
<td className="px-4 py-2 text-right">
<button
onClick={() => onEdit(r)}
className="rounded-lg px-3 py-1 border hover:bg-gray-100"
>Editar</button>
</td>
</tr>
))}
</tbody>
</table>
</div>
)
}


PersonalTable.propTypes = {
rows: PropTypes.array,
loading: PropTypes.bool,
onEdit: PropTypes.func
}