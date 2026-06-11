import React from "react";

const mockTareas = [
	{
		id: "T-001",
		proyecto: "Campus Norte",
		actividad: "Levantamiento inicial",
		responsable: "Ana Ruiz",
		estado: "En progreso",
		avance: 65,
		inicio: 1,
		duracion: 3,
	},
	{
		id: "T-002",
		proyecto: "Campus Norte",
		actividad: "Marcación de perímetro",
		responsable: "Carlos Vega",
		estado: "Pendiente",
		avance: 20,
		inicio: 3,
		duracion: 2,
	},
	{
		id: "T-003",
		proyecto: "Zona Industrial",
		actividad: "Validación en campo",
		responsable: "Lucía Torres",
		estado: "Completada",
		avance: 100,
		inicio: 2,
		duracion: 2,
	},
	{
		id: "T-004",
		proyecto: "Ruta Sur",
		actividad: "Configuración de alertas",
		responsable: "Diego Mora",
		estado: "En riesgo",
		avance: 45,
		inicio: 4,
		duracion: 3,
	},
];

const ganttDias = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const periodos = ["Semana", "Mes", "Trimestre", "Semestre", "Año", "Rango personalizado"];

function getEstadoStyle(estado) {
	if (estado === "Completada") return "bg-emerald-100 text-emerald-700";
	if (estado === "En progreso") return "bg-sky-100 text-sky-700";
	if (estado === "En riesgo") return "bg-amber-100 text-amber-800";
	return "bg-slate-100 text-slate-700";
}

export default function Planificacion() {
	const total = mockTareas.length;
	const completadas = mockTareas.filter((t) => t.estado === "Completada").length;
	const enProgreso = mockTareas.filter((t) => t.estado === "En progreso").length;
	const avancePromedio = Math.round(
		mockTareas.reduce((acc, t) => acc + t.avance, 0) / total
	);

	return (
		<div className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8">
			<div className="mx-auto max-w-7xl space-y-6">
				<header className="rounded-2xl bg-gradient-to-r from-cyan-700 via-teal-700 to-emerald-700 p-6 text-white shadow-lg">
					<h1 className="text-2xl font-bold sm:text-3xl">Planificación Operativa</h1>
					<p className="mt-2 text-sm text-cyan-50 sm:text-base">
						Vista estática de planificación con tareas y cronograma interno.
					</p>
				</header>

				<section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
					<div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
						<div>
							<p className="text-sm font-medium text-slate-700">Período</p>
							<div className="mt-2 flex flex-wrap gap-2">
								{periodos.map((periodo) => (
									<button
										key={periodo}
										type="button"
										className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
											periodo === "Semana"
												? "border-cyan-600 bg-cyan-50 text-cyan-700"
												: "border-slate-300 bg-white text-slate-700"
										}`}
									>
										{periodo}
									</button>
								))}
							</div>
						</div>

						<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
							<label className="flex flex-col text-xs font-medium uppercase tracking-wide text-slate-500">
								Desde
								<input
									type="date"
									className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700"
									defaultValue="2026-06-01"
								/>
							</label>
							<label className="flex flex-col text-xs font-medium uppercase tracking-wide text-slate-500">
								Hasta
								<input
									type="date"
									className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700"
									defaultValue="2026-06-30"
								/>
							</label>
						</div>
					</div>
				</section>

				<section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
					<article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
						<p className="text-sm text-slate-500">Total de tareas</p>
						<p className="mt-1 text-2xl font-semibold text-slate-900">{total}</p>
					</article>
					<article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
						<p className="text-sm text-slate-500">Completadas</p>
						<p className="mt-1 text-2xl font-semibold text-emerald-600">{completadas}</p>
					</article>
					<article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
						<p className="text-sm text-slate-500">En progreso</p>
						<p className="mt-1 text-2xl font-semibold text-sky-600">{enProgreso}</p>
					</article>
					<article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
						<p className="text-sm text-slate-500">Avance promedio</p>
						<p className="mt-1 text-2xl font-semibold text-slate-900">{avancePromedio}%</p>
					</article>
				</section>

				<section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
					<div className="mb-4 flex items-center justify-between">
						<h2 className="text-lg font-semibold text-slate-900">Tabla de tareas</h2>
						<span className="text-sm text-slate-500">Datos mock locales</span>
					</div>

					<div className="overflow-x-auto">
						<table className="min-w-full divide-y divide-slate-200 text-sm">
							<thead className="bg-slate-50">
								<tr>
									<th className="px-3 py-2 text-left font-semibold text-slate-600">ID</th>
									<th className="px-3 py-2 text-left font-semibold text-slate-600">Proyecto</th>
									<th className="px-3 py-2 text-left font-semibold text-slate-600">Actividad</th>
									<th className="px-3 py-2 text-left font-semibold text-slate-600">Responsable</th>
									<th className="px-3 py-2 text-left font-semibold text-slate-600">Estado</th>
									<th className="px-3 py-2 text-left font-semibold text-slate-600">Avance</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-slate-100 bg-white">
								{mockTareas.map((tarea) => (
									<tr key={tarea.id}>
										<td className="px-3 py-2 text-slate-700">{tarea.id}</td>
										<td className="px-3 py-2 text-slate-700">{tarea.proyecto}</td>
										<td className="px-3 py-2 text-slate-700">{tarea.actividad}</td>
										<td className="px-3 py-2 text-slate-700">{tarea.responsable}</td>
										<td className="px-3 py-2">
											<span
												className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${getEstadoStyle(
													tarea.estado
												)}`}
											>
												{tarea.estado}
											</span>
										</td>
										<td className="px-3 py-2">
											<div className="flex items-center gap-2">
												<div className="h-2 w-24 rounded-full bg-slate-200">
													<div
														className="h-2 rounded-full bg-cyan-600"
														style={{ width: `${tarea.avance}%` }}
													/>
												</div>
												<span className="text-xs text-slate-600">{tarea.avance}%</span>
											</div>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</section>

				<section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
					<h2 className="mb-4 text-lg font-semibold text-slate-900">Gantt simple (semanal)</h2>

					<div className="overflow-x-auto">
						<div className="min-w-[760px]">
							<div className="grid grid-cols-[220px_repeat(7,minmax(70px,1fr))] gap-2 border-b border-slate-200 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
								<div>Tarea</div>
								{ganttDias.map((dia) => (
									<div key={dia} className="text-center">
										{dia}
									</div>
								))}
							</div>

							<div className="mt-2 space-y-2">
								{mockTareas.map((tarea) => {
									const inicio = Math.max(1, tarea.inicio);
									const fin = Math.min(7, inicio + tarea.duracion - 1);
									return (
										<div
											key={`gantt-${tarea.id}`}
											className="grid grid-cols-[220px_repeat(7,minmax(70px,1fr))] items-center gap-2"
										>
											<div className="truncate text-sm text-slate-700">{tarea.actividad}</div>
											{ganttDias.map((_, idx) => {
												const dia = idx + 1;
												const activa = dia >= inicio && dia <= fin;
												return (
													<div
														key={`${tarea.id}-${dia}`}
														className="h-8 rounded-md border border-slate-200 bg-slate-50 p-1"
													>
														{activa ? (
															<div className="flex h-full items-center justify-center rounded bg-teal-600 text-[10px] font-semibold text-white">
																{tarea.id}
															</div>
														) : null}
													</div>
												);
											})}
										</div>
									);
								})}
							</div>
						</div>
					</div>
				</section>
			</div>
		</div>
	);
}
