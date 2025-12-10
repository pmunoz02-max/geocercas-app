// useCurrentMembership.js
import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

export function useCurrentMembership() {
  const [role, setRole] = useState(null);
  const [orgId, setOrgId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      const { data, error } = await supabase
        .from("v_current_membership")
        .select("org_id, role")
        .maybeSingle();

      if (!mounted) return;

      if (error) {
        console.error("[useCurrentMembership]", error);
        setRole(null);
        setOrgId(null);
      } else {
        setRole(data?.role ?? null);
        setOrgId(data?.org_id ?? null);
      }
      setLoading(false);
    }

    load();
    return () => { mounted = false; };
  }, []);

  return { role, orgId, loading };
}
