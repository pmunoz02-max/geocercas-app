// src/pages/Login.tsx
import React, { useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";

function hasHashAccessToken(hash: string) {
  return typeof hash === "string" && hash.includes("access_token=");
}

export default function Login() {
  const location = useLocation();
  const navigate = useNavigate();

  const qp = useMemo(() => new URLSearchParams(location.search || ""), [location.search]);
  const next = qp.get("next") || "/inicio";

  useEffect(() => {
    // ✅ Blindaje universal:
    // Si llega PKCE (?code=) o hash token a /login por cualquier razón,
    // NO ejecutamos login ni mostramos UI: reenviamos a /auth/callback.
    const code = qp.get("code");
    if (code) {
      qp.set("next", next);
      navigate(`/auth/callback?${qp.toString()}`, { replace: true });
      return;
    }
    if (hasHashAccessToken(location.hash || "")) {
      const target = `/auth/callback${location.search || ""}${location.hash || ""}`;
      navigate(target, { replace: true });
      return;
    }
  }, [location.hash, location.search, navigate, next, qp]);

  // --- UI simple (mantén tu UI real si quieres, esto es seguro) ---
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center px-4">
      <div className="w-full max-w-xl">
        <div className="bg-slate-900/70 p-10 rounded-[2.25rem] border border-slate-800 shadow-2xl">
          <div className="text-2xl font-semibold">Iniciar sesión</div>
          <div className="text-sm opacity-70 mt-2">
            Si llegaste aquí desde un Magic Link, te redirigimos automáticamente.
          </div>

          {/* Tu formulario real va aquí */}
          <div className="mt-6 text-sm opacity-70">
            next: <span className="opacity-90">{next}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
