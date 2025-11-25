// =============================================
}


const validate = () => {
if (!form.nombre?.trim()) return 'Nombre es obligatorio'
if (!form.apellido?.trim()) return 'Apellido es obligatorio'
if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return 'Email inválido'
if (form.fecha_inicio && form.fecha_fin && form.fecha_fin < form.fecha_inicio) return 'Fecha fin debe ser ≥ inicio'
return null
}


const submit = async (e) => {
e.preventDefault()
const err = validate()
if (err) { alert(err); return }
await onSubmit(form)
}


return (
<dialog ref={dialogRef} className="rounded-2xl p-0 w-full max-w-2xl shadow-2xl">
<form onSubmit={submit} className="p-6">
<h2 className="text-xl font-semibold mb-4">{initial ? 'Editar' : 'Nuevo'} personal</h2>


<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
<div>
<label className="block text-sm mb-1">Nombre</label>
<input className="w-full rounded-xl border p-2" value={form.nombre} onChange={update('nombre')} required />
</div>
<div>
<label className="block text-sm mb-1">Apellido</label>
<input className="w-full rounded-xl border p-2" value={form.apellido} onChange={update('apellido')} required />
</div>
<div>
<label className="block text-sm mb-1">Email</label>
<input className="w-full rounded-xl border p-2" type="email" value={form.email} onChange={update('email')} placeholder="correo@dominio.com" />
</div>
<div>
<label className="block text-sm mb-1">Teléfono</label>
<input className="w-full rounded-xl border p-2" value={form.telefono} onChange={update('telefono')} placeholder="0999999999 o +5939..." />
</div>
<div>
<label className="block text-sm mb-1">Documento</label>
<input className="w-full rounded-xl border p-2" value={form.documento} onChange={update('documento')} />
</div>
<div className="flex items-center gap-2 pt-6">
<input id="vigente" type="checkbox" checked={form.vigente} onChange={update('vigente')} />
<label htmlFor="vigente">Vigente</label>
</div>
<div>
<label className="block text-sm mb-1">Fecha inicio</label>
<input className="w-full rounded-xl border p-2" type="date" value={form.fecha_inicio || ''} onChange={update('fecha_inicio')} />
</div>
<div>
<label className="block text-sm mb-1">Fecha fin</label>
<input className="w-full rounded-xl border p-2" type="date" value={form.fecha_fin || ''} onChange={update('fecha_fin')} />
</div>
</div>


<div className="mt-6 flex justify-end gap-3">
<button type="button" onClick={onCancel} className="rounded-xl px-4 py-2 border">Cancelar</button>
<button type="submit" className="rounded-xl px-4 py-2 bg-blue-600 text-white hover:bg-blue-700">Guardar</button>
</div>
</form>
</dialog>
)
}


PersonalModal.propTypes = {
initial: PropTypes.object,
onCancel: PropTypes.func.isRequired,
onSubmit: PropTypes.func.isRequired,
}


// =============================================
// NOTA DE INTEGRACIÓN
// - Agrega una ruta al router para "/personal" que use <PersonalPage />
// - Asegúrate de tener Tailwind cargado en src/index.css
// - Reutiliza los servicios ya creados en src/services/personal.js