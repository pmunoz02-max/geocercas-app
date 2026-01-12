import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

export default function AuthCallback() {
  const navigate = useNavigate();
  const location = useLocation();

  const ranRef = useRef(false); // evita doble run en mismo mount
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    const run = async () => {
      try {
        const url = new URL(window.location.href);
        const search = url.searchParams;

        const code = search.get("code");
        const token_hash = search.get("token_hash");
        const type = search.get("type"); // invite | magiclink | recovery | signup

        // 🔐 LOCK PERSISTENTE (sobrevive refresh)
        if (token_hash && type) {
          const lockKey = `authcb:${type}:${token_hash}`;
          if (sessionStorage.getItem(lockKey)) {
            throw new Error(
              "Este enlace ya fue procesado. Solicita un nuevo Magic Link."
            );
          }
          sessionStorage.setItem(lockKey, "1");
        }

        // 1️⃣ OAuth (PKCE)
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;

          // 🧽 limpia URL → evita reuso por refresh
          window.history.replaceState({}, document.title, "/inicio");
          navigate("/inicio", { replace: true });
          return;
        }

        // 2️⃣ Magic / Invite / Recovery
        if (token_hash && type) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash,
            type: type as any,
          });

          if (error) throw error;

          // 🧽 limpia URL
          window.history.replaceState({}, document.title, "/inicio");
          navigate("/inicio", { replace: true });
          return;
        }

        throw new Error("Callback inválido: faltan parámetros.");
      } catch (e: any) {
        console.error("[AuthCallback]", e);

        const msg = String(e?.message || "Error autenticando");

        if (
          msg.toLowerCase().includes("invalid") ||
          msg.toLowerCase().includes("expired")
        ) {
          setError("Email link inválido o expirado");
          setDetail(
            "Causas comunes: (1) el enlace ya fue usado, (2) fue abierto por un scanner del correo, o (3) hubo un refresh. Solicita un nuevo Magic Link."
          );
        } else {
          setError(msg);
          setDetail(null);
        }
      }
    };

    run();
  }, [location.search, navigate]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white px-4">
        <div className="p-6 rounded-2xl border border-red-500/30 bg-red-500/10 max-w-md w-full">
          <p className="font-semibold text-lg">Error de autenticación</p>
          <p className="mt-2 text-sm">{error}</p>
          {detail && (
            <p className="mt-3 text-xs text-white/60 leading-relaxed">
              {detail}
            </p>
          )}

          <button
            className="mt-4 w-full px-4 py-2 rounded-lg bg-white text-slate-900 font-semibold"
            onClick={() => navigate("/login?mode=magic", { replace: true })}
          >
            Ir a Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
      <p className="opacity-70">Autenticando…</p>
    </div>
  );
}
