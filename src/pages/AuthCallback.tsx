import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

function getParams(search: string) {
  const p = new URLSearchParams(search);
  return {
    next: p.get("next") || "/",
    orgId: p.get("org_id"),
    token_hash: p.get("token_hash"),
    type: (p.get("type") || "").toLowerCase(), // magiclink, recovery, signup, invite
    code: p.get("code"),
  };
}

export default function AuthCallback() {
  const navigate = useNavigate();
  const location = useLocation();
  const [msg, setMsg] = useState("Autenticando…");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const { next, orgId, token_hash, type, code } = getParams(location.search);
        const href = window.location.href;

        // A) token_hash flow (TU CASO): ?token_hash=...&type=magiclink
        if (token_hash && type) {
          const { error } = await supabase.auth.verifyOtp({
            type: type as any,
            token_hash,
          });
          if (error) throw error;
        }
        // B) PKCE code flow: ?code=...
        else if (code || /\bcode=/.test(href)) {
          const { error } = await supabase.auth.exchangeCodeForSession(href);
          if (error) throw error;
        }
        // C) Implicit flow: #access_token=...
        else if (/#access_token=/.test(href)) {
          const anyAuth: any = supabase.auth as any;
          if (typeof anyAuth.getSessionFromUrl === "function") {
            const { error } = await anyAuth.getSessionFromUrl({ storeSession: true });
            if (error) throw error;
          } else {
            const { data } = await supabase.auth.getSession();
            if (!data?.session) throw new Error("No session found in URL hash");
          }
        } else {
          // D) fallback: ya hay sesión?
          const { data } = await supabase.auth.getSession();
          if (!data?.session) throw new Error("No session found");
        }

        // Confirmar user
        const { data: u } = await supabase.auth.getUser();
        if (!u?.user) throw new Error("User not authenticated after callback");

        if (cancelled) return;

        // Redirigir a next (preservando org_id si vino)
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
          Si no avanza, reabre el link desde el correo (modo incógnito).
        </div>
      </div>
    </div>
  );
}
