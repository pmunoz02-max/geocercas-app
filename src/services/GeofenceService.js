// src/services/GeofenceService.js
export async function createGeofence({ org_id, nombre, geojson, activa = true, visible = true, personal_ids = [], asignacion_ids = [], created_by }) {
const { data, error } = await supabase
.from("geocercas")
.insert([
{
org_id,
nombre,
geom_geojson: geojson,
activa,
visible,
personal_ids,
asignacion_ids,
created_by,
},
])
.select()
.single();
if (error) throw error;
return data;
}


export async function updateGeofence(id, patch) {
const { data, error } = await supabase
.from("geocercas")
.update(patch)
.eq("id", id)
.select()
.single();
if (error) throw error;
return data;
}


export async function setGeofenceVisibility(id, visible) {
return updateGeofence(id, { visible });
}


export async function setGeofenceActive(id, activa) {
return updateGeofence(id, { activa });
}


export async function removeGeofence(id) {
const { error } = await supabase.from("geocercas").delete().eq("id", id);
if (error) throw error;
return true;
}


export async function listPersonal(orgId) {
const { data, error } = await supabase
.from("personal")
.select("id, nombres, apellidos, email, vigente")
.eq("org_id", orgId)
.order("nombres", { ascending: true });
if (error) throw error;
return data || [];
}


export async function listAsignaciones(orgId) {
const { data, error } = await supabase
.from("asignaciones")
.select("id, titulo, vigente")
.eq("org_id", orgId)
.order("titulo", { ascending: true });
if (error) throw error;
return data || [];
}