// src/hooks/useGeocercas.js
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listGeocercas, upsertGeocerca, deleteGeocerca, getGeocerca } from "../lib/geocercasApi.js";

/**
 * Hook canónico (API-first):
 * - NO usa supabase directo
 * - NO usa localStorage cache
 * - Fuente única: /api/geocercas (server-owned, ctx org)
 *
 * Nota: algunas pantallas pueden seguir esperando shape {id,nombre,...}
 * Ajusta si necesitas campos extra.
 */
export function useGeocercas({ onlyActive = true } = {}) {
  const [geocercas, setGeocercas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const isMounted = useRef(true);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await listGeocercas({ orgId: null, onlyActive });
      if (!isMounted.current) return;
      const normalized = (items || [])
        .map((r) => ({
          id: r.id,
          nombre: r.nombre,
          color: r.color || "#3388ff",
          geojson: r.geojson,
          geometry: r.geometry,
          raw: r,
        }))
        .filter((x) => String(x.nombre || "").trim());

      normalized.sort((a, b) => a.nombre.localeCompare(b.nombre));
      setGeocercas(normalized);
      setLoading(false);
    } catch (e) {
      if (!isMounted.current) return;
      setError(e?.message || "Error al cargar geocercas");
      setGeocercas([]);
      setLoading(false);
    }
  }, [onlyActive]);

  const createGeocerca = useCallback(async ({ orgId, nombre, color, geojson, geometry }) => {
    // API server-owned. orgId normalmente viene de currentOrg.id, pero no obligamos aquí.
    const payload = {
      org_id: orgId || null,
      nombre,
      nombre_ci: String(nombre || "").trim().toLowerCase(),
      color: color || "#3388ff",
      geojson: geojson || null,
      geometry: geometry || geojson || null,
    };

    await upsertGeocerca(payload);
    await refetch();
    // Devolvemos el registro recargado (mejor esfuerzo)
    const after = await listGeocercas({ orgId: orgId || null, onlyActive: false });
    return (after || []).find((g) => g.nombre === nombre) || null;
  }, [refetch]);

  const updateGeocerca = useCallback(async (id, { orgId, nombre, color, geojson, geometry }) => {
    const payload = {
      id,
      org_id: orgId || null,
      ...(nombre ? { nombre, nombre_ci: String(nombre).trim().toLowerCase() } : {}),
      ...(color ? { color } : {}),
      ...(geojson ? { geojson } : {}),
      ...(geometry ? { geometry } : {}),
    };

    await upsertGeocerca(payload);
    await refetch();
    return await getGeocerca({ id, orgId: orgId || null });
  }, [refetch]);

  const removeGeocerca = useCallback(async ({ orgId, nombre }) => {
    // En tu API ya manejas delete por nombres_ci
    const nm = String(nombre || "").trim();
    if (!nm) throw new Error("nombre requerido para eliminar");
    await deleteGeocerca({ orgId: orgId || null, nombres_ci: [nm.toLowerCase()] });
    await refetch();
  }, [refetch]);

  useEffect(() => {
    isMounted.current = true;
    refetch();
    return () => {
      isMounted.current = false;
    };
  }, [refetch]);

  return useMemo(
    () => ({
      geocercas,
      loading,
      error,
      refetch,
      createGeocerca,
      updateGeocerca,
      removeGeocerca,
    }),
    [geocercas, loading, error, refetch, createGeocerca, updateGeocerca, removeGeocerca]
  );
}
