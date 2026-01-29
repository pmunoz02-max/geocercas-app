import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

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
        const hasHashToken = /#access_token=/.test(href);

        if (hasCode) {
          const { error } = await supabase.auth.exchangeCodeForSession(href);
          if (error) throw error;
        } else if (hasHashToken) {
          // Implicit flow: access_token viene en hash
          const anyAuth: any = supabase.auth as any;
          if (typeof anyAuth.getSessionFromUrl === "function") {
            const { error } = await anyAuth.getSessionFromUrl({ storeSession: true });
            if (error) throw error;
          } else {
            // fallback
            const { data } = await supabase.auth.getSession();
            if (!data?.session) throw new Error("No session found in URL hash");
          }
        } else {
          const { data } = await supabase.auth.getSession();
          if (!data?.session) throw new Error("No session found");
        }

        const { data: u } = await supabase.auth.getUser();
        if (!u?.user) throw new Error("No user after callback");

        const params = new URLSearchParams(location.search);
        const next = params.get("next") || "/";
        const orgId = params.get("org_id");

        if (cancelled) return;

        if (orgId) {
          const sep = next.includes("?") ? "&" : "?";
          navigate(`${next}${sep}org_id=${encodeURIComponent(orgId)}`, { replace: true });
        } else {
          navigate(next, { replace: true });
        }
      } catch (e) {
        console.error("AuthCallback failed:", e);
        if (!cancelled) setMsg("Error autenticando el link. Ábrelo nuevamente desde el email.");
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
          Si esto no avanza, reabre el link desde el correo en modo incógnito.
        </div>
      </div>
    </div>
  );
}
