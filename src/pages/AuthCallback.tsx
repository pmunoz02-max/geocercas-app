// src/pages/AuthCallback.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient"; // AJUSTA si tu path/export es distinto

type UiStatus = "loading" | "ok" | "error";

function parseHashParams(hash: string) {
  const h = (hash || "").replace(/^#/, "");
  const sp = new URLSearchParams(h);
  const obj: Record<string, string> = {};
  for (const [k, v] of sp.entries()) obj[k] = v;
  return obj;
}

function pickTargetByRoles(roles: string[]) {
  const lower = new Set(roles.map((r) => String(r || "").toLowerCase()));
  if (lower.has("owner") || lower.has("admin") || lower.has("viewer")) return "/inicio";
  if (lower.has("tracker")) return "/tracker-gps";
  return "/inicio";
}

export default function AuthCallback() {
  const navigate = useNavigate();
  const location = useLocation();

  const ranRef = useRef(false);

  const [status, setStatus] = useState<UiStatus>("loading");
  const [message, setMessage] = useState<string>("Procesando enlace de acceso…");
  const [details, setDetails] = useState<string>("");

  const { searchParams, hashParams } = useMemo(() => {
    const sp = new URLSearchParams(location.search || "");
    const hp = parseHashParams(location.hash || "");
    return { searchParams: sp, hashParams: hp };
  }, [location.search, location.hash]);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    (async () => {
      try {
        setStatus("loading");
        setMessage("Verificando enlace con Supabase…");
        setDetails("");

        // 1) Si viene PKCE/OAuth: ?code=...
        const code = searchParams.get("code");
        if (code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          if (!data?.session) throw new Error("No se pudo crear sesión (exchangeCodeForSession).");
        } else {
          // 2) Si viene token_hash: ?token_hash=...&type=...
          const token_hash = searchParams.get("token_hash");
          const type = searchParams.get("type"); // invite | magiclink | signup | recovery

          // 3) Legacy: #access_token=... (si existiera)
          const access_token = hashParams["access_token"];
          const refresh_token = hashParams["refresh_token"];

          if (access_token && refresh_token) {
            const { error } = await supabase.auth.setSession({ access_token, refresh_token });
            if (error) throw error;
          } else if (token_hash && type) {
            // OJO: aquí está el punto crítico que te faltaba
            const { data, error } = await supabase.auth.verifyOtp({
              token_hash,
              type: type as any,
            });
            if (error) throw error;
            if (!data?.session) {
              // A veces verifyOtp devuelve user pero no session si algo falló
              const { data: s2 } = await supabase.auth.getSession();
              if (!s2?.session) throw new Error("Enlace verificado pero no se creó sesión.");
            }
          } else {
            // Si no hay nada, intentamos ver si ya existe sesión
            const { data } = await supabase.auth.getSession();
            if (!data?.session) {
              throw new Error("URL de callback sin parámetros válidos (code/token_hash).");
            }
          }
        }

        setMessage("Cargando perfil y permisos…");

        // Confirmar sesión
        const { data: sessionData } = await supabase.auth.getSession();
        const session = sessionData?.session;
        if (!session?.user) throw new Error("No hay sesión activa después de verificar el enlace.");

        const userId = session.user.id;

        // Leer roles (RLS debería permitirlo al usuario autenticado)
        const { data: rolesData, error: rolesErr } = await supabase
          .from("app_user_roles")
          .select("role")
          .eq("user_id", userId);

        if (rolesErr) {
          // No bloqueamos: igual mandamos a /inicio y AuthGuard ordena
          console.warn("[AuthCallback] roles query failed", rolesErr);
        }

        const roles = (rolesData || []).map((r: any) => String(r?.role || ""));
        const target = roles.length ? pickTargetByRoles(roles) : "/inicio";

        setStatus("ok");
        setMessage("Listo. Redirigiendo…");

        // Limpia query/hash para que no reintente verify en refresh
        navigate(target, { replace: true });
      } catch (e: any) {
        console.error("[AuthCallback] error", e);

        const msg = String(e?.message || e || "Error desconocido");
        setStatus("error");

        // Mensaje más humano cuando es típico “expiró / inválido”
        if (msg.toLowerCase().includes("otp") || msg.toLowerCase().includes("expired") || msg.includes("403")) {
          setMessage("El link del correo es inválido o ya expiró.");
          setDetails("Pide que te reenvíen la invitación y abre el link solo una vez.");
        } else {
          setMessage("Error procesando el enlace de acceso.");
          setDetails(msg);
        }
      }
    })();
  }, [navigate, searchParams, hashParams]);

  const goLogin = () => navigate("/login", { replace: true });
  const goHome = () => navigate("/", { replace: true });

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-2xl bg-white border border-slate-200 shadow-sm rounded-2xl p-8">
        <h1 className="text-2xl font-semibold text-slate-900">Auth Callback</h1>

        <div className="mt-4">
          {status === "loading" && (
            <p className="text-slate-600">{message}</p>
          )}

          {status === "ok" && (
            <p className="text-emerald-700 font-medium">{message}</p>
          )}

          {status === "error" && (
            <>
              <p className="text-red-600 font-semibold">Error</p>
              <p className="text-slate-700 mt-2">{message}</p>
              {details ? <p className="text-slate-500 mt-2 text-sm">{details}</p> : null}

              <div className="mt-6 flex gap-3">
                <button
                  onClick={goLogin}
                  className="px-4 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800"
                >
                  Ir a Login
                </button>
                <button
                  onClick={goHome}
                  className="px-4 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  Ir al inicio
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
