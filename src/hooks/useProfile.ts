// src/hooks/useProfile.ts
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import { useAuth } from "@/context/AuthProvider";

// Define los posibles roles de tu app
export type AppRoleSlug = "owner" | "admin" | "tracker";

// Define la estructura del perfil que devuelve tu RPC get_my_profile
export type MyProfile = {
  id: string;
  email: string;
  full_name: string | null;
  role_slug: AppRoleSlug;
  role_id: string | null;
  org_id: string | null;
  org_name: string | null;
  created_at: string;
};

/**
 * Hook useProfile()
 * Lee el perfil del usuario autenticado usando el RPC get_my_profile().
 * Controla los estados loading, error y permite refrescar.
 */
export function useProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(!!user);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Se asume que existe la función get_my_profile() en Supabase
      const { data, error } = await supabase.rpc("get_my_profile");
      if (error) {
        console.error("Error en get_my_profile:", error);
        setError(error.message);
        setProfile(null);
      } else if (Array.isArray(data) && data.length > 0) {
        // Si el RPC devuelve un array
        setProfile(data[0]);
      } else if (data && typeof data === "object") {
        // Si devuelve un único registro
        setProfile(data as MyProfile);
      } else {
        setProfile(null);
      }
    } catch (e: any) {
      setError(e?.message ?? "Error desconocido al cargar perfil");
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const value = useMemo(
    () => ({
      profile,
      loading,
      error,
      refresh: fetchProfile,
    }),
    [profile, loading, error, fetchProfile]
  );

  return value;
}

