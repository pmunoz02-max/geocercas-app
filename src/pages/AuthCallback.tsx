// src/pages/AuthCallback.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../contexts/AuthContext";

type Status = "idle" | "processing" | "success" | "error";

const PANEL_PATH = "/inicio"; // <-- tu "panel" (cámbialo si tu panel es otra ruta)
const LOGIN_PATH = "/login";
const HOME_PATH = "/";

function parseHashParams(hash: string) {
  const h = (hash || "").replace(/^#/, "");
  return new URLSearchParams(h);
}

function friendlyErrorMessage(err: any) {
  const msg = String(err?.message || err || "").toLowerCase();

  // Supabase suele devolver 403 / "invalid" / "expired"
  if (
    msg.includes("expired") ||
    msg.includes("invalid") ||
    msg.includes("token") ||
    msg.includes("403")
  ) {
    return "El link del correo es inválido o ya expiró. Pide que te reenvíen una nueva invitación y abre el link solo una vez.";
  }

  return "No se pudo completar el acceso. Intenta nuevamente o solicita un nuevo link.";
}

export default function AuthCallback() {
  const navigate = useNavigate();
  const location = useLocation();
  const { reloadAuth } = useAuth?.() ?? ({} as any);

  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string>("Procesando autenticación…");
  const [debug, setDebug] = useState<string>("");

  // Evita doble ejecución (React StrictMode en dev puede correr 2 veces el effect)
  const ranRef = useRef(false);

  const searchParams = useMemo(
    () => new URLSearchParams(location.search || ""),
    [location.search]
  );

  const hashParams = useMemo(
    () => parseHashParams(location.hash || ""),
    [location.hash]
  );

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    const run = async () => {
      setStatus("processing");
      setMessage("Validando link…");

      try {
        // 1) Caso A: viene token_hash + type en QUERY (?token_hash=...&type=invite)
        const token_hash = searchParams.get("token_hash");
        const type = (searchParams.get("type") || "").toLowerCase();

        if (token_hash && type) {
          setDebug(`flow=verifyOtp type=${type}`);

          const allowed = new Set([
            "invite",
            "magiclink",
            "recovery",
            "email_change",
            "signup",
          ]);

          if (!allowed.has(type)) {
            throw new Error(`Unsupported type: ${type}`);
          }

          const { data, error } = await supabase.auth.verifyOtp({
            type: type as any,
            token_hash,
          });

          if (error) throw error;

          // Refresca tu AuthContext / org bootstrap, etc.
          if (typeof reloadAuth === "function") {
            await reloadAuth();
          }

          setStatus("success");
          setMessage("Acceso confirmado. Redirigiendo al panel…");
          navigate(PANEL_PATH, { replace: true });
          return;
        }

        // 2) Caso B: viene access_token en HASH (#access_token=...&refresh_token=...)
        const access_token = hashParams.get("access_token");
        const refresh_token = hashParams.get("refresh_token");

        if (access_token || refresh_token) {
          setDebug("flow=getSessionFromUrl");

          const { data, error } = await supabase.auth.getSessionFromUrl({
            storeSession: true,
          });

          if (error) throw error;

          if (typeof reloadAuth === "function") {
            await reloadAuth();
          }

          setStatus("success");
          setMessage("Acceso confirmado. Redirigiendo al panel…");
          navigate(PANEL_PATH, { replace: true });
          return;
        }

        // 3) Si no vino nada útil, mandamos al login
        setStatus("error");
        setMessage(
          "No se encontraron parámetros de autenticación en el link. Intenta iniciar sesión nuevamente."
        );
      } catch (err: any) {
        console.error("[AuthCallback] error:", err);
        setStatus("error");
        setMessage(friendlyErrorMessage(err));
        setDebug((prev) => prev || `err=${String(err?.message || err)}`);
      }
    };

    run();
  }, [hashParams, searchParams, navigate, reloadAuth]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 px-4">
      <div className="w-full max-w-3xl rounded-2xl bg-white text-slate-900 shadow-lg p-8">
        <h1 className="text-2xl font-semibold mb-4">Auth Callback</h1>

        {status === "processing" && (
          <p className="text-slate-700">{message}</p>
        )}

        {status === "success" && (
          <p className="text-emerald-700 font-medium">{message}</p>
        )}

        {status === "error" && (
          <>
            <p className="text-red-600 font-semibold mb-2">Error</p>
            <p className="text-slate-700 mb-6">{message}</p>

            <div className="flex gap-3">
              <Link
                to={LOGIN_PATH}
                className="px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800"
              >
                Ir a Login
              </Link>
              <Link
                to={HOME_PATH}
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500"
              >
                Ir al inicio
              </Link>
            </div>
          </>
        )}

        {/* Debug pequeño (útil mientras arreglamos 403). Quita cuando esté OK */}
        {debug ? (
          <pre className="mt-6 text-xs bg-slate-100 text-slate-700 p-3 rounded-lg overflow-auto">
            {debug}
          </pre>
        ) : null}
      </div>
    </div>
  );
}
