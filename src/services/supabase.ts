// src/services/supabase.ts
// ============================================================
// Servicio central de acceso a Supabase (versión unificada).
// Usa el cliente global definido en src/lib/supabaseClient.js
// o el shim src/supabaseClient.js
// ============================================================

import supabase from "../supabaseClient"  // ✅ Usa cliente único compartido

// ===================== Helper: obtener sesión =====================
export async function getSession() {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw new Error(`Error al obtener sesión: ${error.message}`)
  return data.session
}

// ===================== Helper: usuario actual =====================
export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser()
  if (error) throw new Error(`Error al obtener usuario actual: ${error.message}`)
  return data.user
}

// ===================== Verificación de login =====================
export async function isLoggedIn(): Promise<boolean> {
  const session = await getSession()
  return !!session
}

// ===================== Insertar registro genérico =====================
export async function insertRow(table: string, row: Record<string, any>) {
  const { data, error } = await supabase.from(table).insert([row]).select().single()
  if (error) throw new Error(`Error al insertar en ${table}: ${error.message}`)
  return data
}

// ===================== Actualizar registro genérico =====================
export async function updateRow(
  table: string,
  id: string,
  updates: Record<string, any>
) {
  const { data, error } = await supabase
    .from(table)
    .update(updates)
    .eq("id", id)
    .select()
    .single()
  if (error) throw new Error(`Error al actualizar ${table}: ${error.message}`)
  return data
}

// ===================== Eliminar registro genérico =====================
export async function deleteRow(table: string, id: string) {
  const { error } = await supabase.from(table).delete().eq("id", id)
  if (error) throw new Error(`Error al eliminar en ${table}: ${error.message}`)
  return true
}

// ===================== Seleccionar todos los registros =====================
export async function selectAll(table: string) {
  const { data, error } = await supabase.from(table).select("*")
  if (error) throw new Error(`Error al listar ${table}: ${error.message}`)
  return data
}

// ===================== Consulta filtrada genérica =====================
export async function selectFiltered(
  table: string,
  filters: Record<string, any>
) {
  let query = supabase.from(table).select("*")
  for (const [key, value] of Object.entries(filters)) {
    query = query.eq(key, value)
  }
  const { data, error } = await query
  if (error) throw new Error(`Error al filtrar ${table}: ${error.message}`)
  return data
}

// ===================== Helper: llamar función RPC =====================
export async function callRpc(fnName: string, params?: Record<string, any>) {
  const { data, error } = await supabase.rpc(fnName, params ?? {})
  if (error) throw new Error(`Error RPC ${fnName}: ${error.message}`)
  return data
}
