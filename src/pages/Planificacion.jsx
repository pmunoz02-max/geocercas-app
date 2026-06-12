import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import { useAuth } from "@/context/auth.js";

const mockTareasBase = [
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

function toEstadoLabel(status) {
	const s = String(status || "").toLowerCase();
	if (s === "closed") return "Completada";
	if (s === "approved") return "En progreso";
	if (s === "archived") return "Archivada";
	if (s === "draft") return "Pendiente";
	return "Pendiente";
}

function toAvance(status) {
	const s = String(status || "").toLowerCase();
	if (s === "closed") return 100;
	if (s === "approved") return 65;
	if (s === "archived") return 0;
	if (s === "draft") return 20;
	return 30;
}

function toTimeline(startDate, endDate) {
	const s = startDate ? new Date(startDate) : null;
	const e = endDate ? new Date(endDate) : s;

	if (!s || Number.isNaN(s.getTime())) {
		return { inicio: 1, duracion: 1 };
	}

	const startWeekday = ((s.getDay() + 6) % 7) + 1;
	let duration = 1;

	if (e && !Number.isNaN(e.getTime())) {
		const diffDays = Math.floor((e.getTime() - s.getTime()) / 86400000) + 1;
		duration = Math.max(1, Math.min(7, diffDays));
	}

	return { inicio: startWeekday, duracion: duration };
}

export default function Planificacion() {
	const { currentOrg } = useAuth();
	const orgId = currentOrg?.id || null;
	const [tareasDb, setTareasDb] = useState([]);
	const [geofencesDb, setGeofencesDb] = useState([]);
	const [activitiesDb, setActivitiesDb] = useState([]);
	const [loadingDb, setLoadingDb] = useState(false);
	const [errorDb, setErrorDb] = useState("");
	const [dbReady, setDbReady] = useState(false);

	useEffect(() => {
		if (!orgId) {
			setTareasDb([]);
			setGeofencesDb([]);
			setActivitiesDb([]);
			setErrorDb("");
			setDbReady(false);
			return;
		}

		let isActive = true;

		const loadPlanningData = async () => {
			setLoadingDb(true);
			setErrorDb("");

			try {
				const planningQuery = supabase
					.from("planning_items")
					.select(
						"id, org_id, geofence_id, activity_id, start_date, end_date, planned_hours, planned_cost, status, notes"
					)
					.eq("org_id", orgId)
					.is("archived_at", null)
					.order("start_date", { ascending: true });

				const geofencesQuery = supabase
					.from("geofences")
					.select("id, name, active")
					.eq("org_id", orgId)
					.eq("active", true)
					.order("name", { ascending: true });

				const activitiesQuery = supabase
					.from("activities")
					.select("id, name, active, hourly_rate, currency_code")
					.eq("org_id", orgId)
					.eq("active", true)
					.order("name", { ascending: true });

				const [planningResult, geofencesResult, activitiesResult] = await Promise.all([
					planningQuery,
					geofencesQuery,
					activitiesQuery,
				]);

				const { data: planningData, error: planningError } = planningResult;
				const { data: geofencesData, error: geofencesError } = geofencesResult;
				const { data: activitiesData, error: activitiesError } = activitiesResult;

				if (planningError) throw planningError;
				if (geofencesError) throw geofencesError;
				if (activitiesError) throw activitiesError;

				const geofenceNames = new Map(
					(geofencesData || []).map((g) => [String(g.id), g.name || "Geocerca sin nombre"])
				);
				const activityNames = new Map(
					(activitiesData || []).map((a) => [String(a.id), a.name || "Actividad sin nombre"])
				);
				const mapped = (planningData || []).map((row, index) => {
					const timeline = toTimeline(row.start_date, row.end_date);
					const estado = toEstadoLabel(row.status);
					const geofenceId = row.geofence_id ? String(row.geofence_id) : "";
					const activityId = row.activity_id ? String(row.activity_id) : "";
					return {
						id: row.id ? `P-${String(row.id).slice(0, 6).toUpperCase()}` : `P-${index + 1}`,
						proyecto: geofenceId
							? geofenceNames.get(geofenceId) || `Geocerca ${geofenceId.slice(0, 8)}`
							: "Geocerca sin definir",
						actividad: activityId
							? activityNames.get(activityId) || `Actividad ${activityId.slice(0, 8)}`
							: "Actividad sin definir",
						responsable: "Equipo operativo",
						estado,
						avance: toAvance(row.status),
						inicio: timeline.inicio,
						duracion: timeline.duracion,
					};
				});

				if (isActive) {
					setTareasDb(mapped);
					setGeofencesDb(geofencesData || []);
					setActivitiesDb(activitiesData || []);
					setDbReady(true);
				}
			} catch (err) {
				console.error("[Planificacion] Error cargando datos de planificación:", err);
				if (isActive) {
					setErrorDb("No se pudo cargar planificación desde Supabase. Mostrando demo local.");
					setTareasDb([]);
					setGeofencesDb([]);
					setActivitiesDb([]);
					setDbReady(false);
				}
			} finally {
				if (isActive) {
					setLoadingDb(false);
				}
			}
		};

		loadPlanningData();

		return () => {
			isActive = false;
		};
	}, [orgId]);

	const tareas = useMemo(() => {
		if (dbReady) return tareasDb;
		return mockTareasBase;
	}, [dbReady, tareasDb]);

	const total = tareas.length;
	const completadas = tareas.filter((t) => t.estado === "Completada").length;
	const enProgreso = tareas.filter((t) => t.estado === "En progreso").length;
	const avancePromedio =
		total > 0
			? Math.round(tareas.reduce((acc, t) => acc + t.avance, 0) / total)
			: 0;
	const mostrandoDemo = !dbReady;
	const sinDatosReales = dbReady && tareas.length === 0;

	return (
		<div className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8">
			<div className="mx-auto max-w-7xl space-y-6">
				<header className="rounded-2xl bg-gradient-to-r from-cyan-700 via-teal-700 to-emerald-700 p-6 text-white shadow-lg">
					<h1 className="text-2xl font-bold sm:text-3xl">Planificación Operativa</h1>
					<p className="mt-2 text-sm text-cyan-50 sm:text-base">
						Vista conectada en modo solo lectura con respaldo demo local.
					</p>
				</header>

				{loadingDb ? (
					<section className="rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-800">
						Cargando planificación desde Supabase...
					</section>
				) : null}

				{errorDb ? (
					<section className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
						{errorDb}
					</section>
				) : null}

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
						<span className="text-sm text-slate-500">
							{mostrandoDemo ? "Datos demo locales" : "Datos reales Preview"}
						</span>
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
								{sinDatosReales ? (
									<tr>
										<td className="px-3 py-6 text-center text-slate-500" colSpan={6}>
											No hay planificación registrada para esta organización.
										</td>
									</tr>
								) : (
									tareas.map((tarea) => (
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
									))
								)}
							</tbody>
						</table>
					</div>
				</section>

				<section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
					<h2 className="text-lg font-semibold text-slate-900">Vista temporal simple</h2>
					<p className="mb-4 mt-1 text-sm text-slate-500">
						Escala demostrativa para visualizar actividades por período. La escala real se
						definirá al conectar datos.
					</p>

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
								{tareas.map((tarea) => {
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
