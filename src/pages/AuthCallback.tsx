import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

function pickNextAndOrg(search: string) {
  const params = new URLSearchParams(search);
  const next = params.get("next") || "/";
  const orgId = params.get("org_id");
  return { next, orgId };
}

export default function AuthCallback() {
  const navigate = useNavigate();
  const location = useLocation();
  const [msg, setMsg] = useState("Autenticando…");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const href = window.location.href;
        const hasCode = /\bcode=/.test(href);
        const hasAccessToken = /access_token=/.test(href) || /token=/.test(href);

        // 1) PKCE flow: ?code=...
        if (hasCode) {
          const { error } = await supabase.auth.exchangeCodeForSession(href);
          if (error) throw error;
        } else if (hasAccessToken) {
          // 2) Implicit flow: #access_token=...
          // Supabase-js v2 soporta getSessionFromUrl
          const anyAuth: any = supabase.auth as any;
          if (typeof anyAuth.getSessionFromUrl === "function") {
            const { error } = await anyAuth.getSessionFromUrl({ storeSession: true });
            if (error) throw error;
          } else {
            // fallback: intentar obtener sesión normal (por si detectSessionInUrl ya la guardó)
            const { data } = await supabase.auth.getSession();
            if (!data?.session) throw new Error("No session found in URL");
          }
        } else {
          // 3) No hay code ni token: igual validar si ya existe sesión
          const { data } = await supabase.auth.getSession();
          if (!data?.session) throw new Error("No session found");
        }

        // 4) Confirmar que ya hay user
        const { data: u } = await supabase.auth.getUser();
        if (!u?.user) throw new Error("User not authenticated after callback");

        // 5) Redirigir a next + org_id
        const { next, orgId } = pickNextAndOrg(location.search);

        if (cancelled) return;

        if (orgId) {
          // Si next ya tiene "?", no romper
          const sep = next.includes("?") ? "&" : "?";
          navigate(`${next}${sep}org_id=${encodeURIComponent(orgId)}`, { replace: true });
        } else {
          navigate(next, { replace: true });
        }
      } catch (e: any) {
        console.error("AuthCallback failed:", e);
        if (cancelled) return;
        setMsg("Error autenticando el link. Ábrelo nuevamente desde el email.");
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [navigate, location.search]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="p-6 bg-white rounded-xl shadow max-w-md w-full text-center">
        <h2 className="text-lg font-semibold mb-2">{msg}</h2>
        <div className="text-sm text-gray-600">
          Si esto se queda aquí, reabre el link desde el correo (modo incógnito).
        </div>
      </div>
    </div>
  );
}
