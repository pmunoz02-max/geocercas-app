import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

export default function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    const token_hash = params.get("token_hash");
    const type = (params.get("type") as "magiclink" | "recovery" | null) ?? null;

    // next puede NO venir (porque Supabase lo “limpia”)
    const next = params.get("next") || "/tracker-gps";

    let redirected = false;

    const resolveOrgId = async (userId: string): Promise<string | null> => {
      // 1) Preferido: tu RPC canonical (multi-tenant)
      try {
        const { data, error } = await supabase.rpc("get_my_context");
        if (!error && data?.ok && data?.org_id) return data.org_id as string;
      } catch {
        // ignore
      }

      // 2) Fallback: memberships del propio usuario (último)
      try {
        const { data, error } = await supabase
          .from("memberships")
          .select("org_id, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!error && data?.org_id) return data.org_id as string;
      } catch {
        // ignore
      }

      return null;
    };

    const finalizeRedirect = async () => {
      // confirmar user
      const { data: u } = await supabase.auth.getUser();
      const user = u?.user;
      if (!user) {
        setError("No se pudo establecer sesión (getUser null).");
        return;
      }

      const orgId = await resolveOrgId(user.id);

      // si logramos org_id, lo pasamos al tracker-gps (clave)
      const target = orgId ? `${next}?org_id=${orgId}` : next;

      redirected = true;
      navigate(target, { replace: true });
    };

    const handleAuth = async () => {
      try {
        // ✅ Caso real: token_hash + type=magiclink
        if (token_hash && type) {
          const { error } = await supabase.auth.verifyOtp({
            type,
            token_hash,
          });
          if (error) {
            setError(error.message);
            return;
          }
        }

        // 🟡 PKCE (por si llega code)
        const code = params.get("code");
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            setError(error.message);
            return;
          }
        }

        // ✅ Esperar confirmación real de SIGNED_IN
        const {
          data: { subscription },
        } = supabase.auth.onAuthStateChange(async (event) => {
          if (event === "SIGNED_IN" && !redirected) {
            subscription.unsubscribe();
            await finalizeRedirect();
          }
        });

        // ⛑ Fallback por si el evento ya ocurrió
        setTimeout(() => {
          if (!redirected) finalizeRedirect();
        }, 900);
      } catch (e: any) {
        setError(e?.message || "Error desconocido en AuthCallback");
      }
    };

    handleAuth();
  }, [navigate]);

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        fontFamily: "sans-serif",
      }}
    >
      {!error ? (
        <>
          <h3>Autenticando…</h3>
          <p>Preparando GPS</p>
        </>
      ) : (
        <>
          <h3>Error de autenticación</h3>
          <pre>{error}</pre>
        </>
      )}
    </div>
  );
}
