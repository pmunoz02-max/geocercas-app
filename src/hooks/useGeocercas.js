// src/hooks/useGeocercas.js
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabaseClient";

const LS_KEY = "geocercas_cache_v1";

// ========== Helpers ==========
const UUID_ZERO = "00000000-0000-0000-0000-000000000000";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUUID(v) {
  if (typeof v !== "string") return false;
  if (v === UUID_ZERO) return false;
  return UUID_RE.test(v);
}
function isNumericId(v) {
  if (typeof v === "number" && Number.isFinite(v)) return true;
  if (typeof v === "string" && /^\d+$/.test(v)) return true;
  return false;
}
function readCache() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
function writeCache(items) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(items));
  } catch {}
}
function clearCache() {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {}
}

/** Normaliza fila de la vista `geocercas_v` */
function normalizeRow(row) {
  // `row.id` llega como TEXTO (desde la vista). La mantenemos como string.
  // `row.coords` llega como [[lat, lng], ...]
  const polygon =
    Array.isArray(row?.coords) ?
      row.coords.map(([lat, lng]) => [Number(lat), Number(lng)]) :
      [];

  return {
    id: String(row.id),                // <- siempre string (vista)
    nombre: row.nombre,
    color: row.color || "#3388ff",
    polygon,
    raw: row,
  };
}

export function useGeocercas() {
  const [geocercas, setGeocercas] = useState(() => readCache());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const isMounted = useRef(true);

  const purgeInvalidFromState = useCallback(() => {
    const cleaned = (geocercas || []).filter((g) => {
      // En vista el id es string; aceptamos numéricos ("123") o UUID válido
      return isNumericId(g.id) || isValidUUID(g.id);
    });
    if (cleaned.length !== geocercas.length) {
      setGeocercas(cleaned);
      writeCache(cleaned);
    }
  }, [geocercas]);

  // ======== READ ========
  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("geocercas_v")            // <-- vista segura
      .select("*")
      .order("created_at", { ascending: false });

    if (!isMounted.current) return;

    if (err) {
      setError(err.message || "Error al cargar geocercas");
      setLoading(false);
      return;
    }

    const normalized = (data || []).map(normalizeRow);
    setGeocercas(normalized);
    writeCache(normalized);
    setLoading(false);
  }, []);

  // ======== CREATE ========
  const createGeocerca = useCallback(async ({ nombre, polygon, color = "#3388ff" }) => {
    const payload = {
      nombre,
      color,
      coords: (polygon || []).map(([lat, lng]) => [Number(lat), Number(lng)]),
      // owner_id lo rellena trigger en DB (auth.uid())
    };

    const { data, error: err } = await supabase
      .from("geocercas_v")            // INSERT en vista (trigger mueve a tabla real)
      .insert(payload)
      .select("*")
      .single();

    if (err) throw new Error(err.message || "No se pudo crear la geocerca");

    const added = normalizeRow(data);
    setGeocercas((prev) => {
      const next = [added, ...prev];
      writeCache(next);
      return next;
    });
    return added;
  }, []);

  // ======== UPDATE ========
  const updateGeocerca = useCallback(async (id, updates) => {
    // En la vista, id es texto; la UPDATE se hace contra la vista y el trigger
    // traduce hacia la tabla real (convierte a BIGINT si aplica).
    const payload = {};
    if (updates.nombre) payload.nombre = updates.nombre;
    if (updates.color) payload.color = updates.color;
    if (updates.polygon) {
      payload.coords = updates.polygon.map(([lat, lng]) => [Number(lat), Number(lng)]);
    }

    const { data, error: err } = await supabase
      .from("geocercas_v")
      .update(payload)
      .eq("id", String(id))           // id como texto
      .select("*")
      .single();

    if (err) throw new Error(err.message || "No se pudo actualizar");

    const upd = normalizeRow(data);
    setGeocercas((prev) => {
      const next = prev.map((g) => (String(g.id) === String(id) ? upd : g));
      writeCache(next);
      return next;
    });
    return upd;
  }, []);

  // ======== DELETE (una) ========
  const removeGeocerca = useCallback(async (id) => {
    // Borramos contra la vista: si id no es numérico válido, el trigger ignora sin error.
    const { error: err } = await supabase.from("geocercas_v").delete().eq("id", String(id));
    if (err) throw new Error(err.message || "No se pudo eliminar");
    setGeocercas((prev) => {
      const next = prev.filter((g) => String(g.id) !== String(id));
      writeCache(next);
      return next;
    });
  }, []);

  // ======== DELETE (todas) vía RPC segura ========
  const removeAllByState = useCallback(async () => {
    // No enviamos IDs; el server borra por owner (RLS / auth.uid()).
    const { error: err } = await supabase.rpc("delete_all_geocercas_for_user");
    if (err) throw new Error(err.message || "No se pudieron borrar las geocercas");
    setGeocercas([]);
    writeCache([]);
  }, []);

  const resetLocalCache = useCallback(() => {
    clearCache();
    setGeocercas([]);
  }, []);

  useEffect(() => {
    isMounted.current = true;
    refetch().then(purgeInvalidFromState);
    return () => {
      isMounted.current = false;
    };
  }, [refetch, purgeInvalidFromState]);

  return useMemo(
    () => ({
      geocercas,
      loading,
      error,
      refetch,
      createGeocerca,
      updateGeocerca,
      removeGeocerca,
      removeAllByState,
      resetLocalCache,
    }),
    [
      geocercas,
      loading,
      error,
      refetch,
      createGeocerca,
      updateGeocerca,
      removeGeocerca,
      removeAllByState,
      resetLocalCache,
    ]
  );
}
