import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

// 🔁 AJUSTA ESTA RUTA A TU PROYECTO
// Ejemplos típicos:
// import { supabase } from "../lib/supabaseClient";
// import { supabase } from "../supabaseClient";
import { supabase } from "../lib/supabaseClient";

type OtpType = "invite" | "magiclink" | "recovery" | "signup" | "email_change";

function safeDecode(s: string) {
  try {
    return decodeURIComponent(s.replace(/\+/g, " "));
  } catch {
    return s;
  }
}

function parseHashParams(hash: string) {
  const out = new URLSearchParams();
  const h = (hash || "").replace(/^#/, "");
  if (!h) return out;
  // Algunos providers devuelven fragment estilo querystring
  for (const part of h.split("&")) {
    const [k, v] = part.split("=");
    if (k) out.set(k, v ?? "");
  }
  return out;
}

function humanMessage(err: any) {
  const msg = String(err?.message || err?.error_description || err?.error || "").toLowerCase();

  if (msg.includes("invalid") || msg.includes("expired")) {
    return "El link del correo es inválido o ya expiró. Pide que te reenvíen una nueva invitación y abre el link solo una vez.";
  }
  if (msg.includes("forbidden") || msg.includes("403")) {
    return "Acceso denegado (403). Normalmente ocurre cuando el token ya fue usado o expiró.";
  }
  if (msg.includes("not found") || msg.includes("404")) {
    return "La ruta de callback no existe o no está siendo servida (404). (Esto ya lo arreglaste con el rewrite).";
  }
  return "No se pudo completar el inicio de sesión con el link. Reintenta con un link nuevo.";
}

export default function AuthCallback() {
  const navigate = useNavigate();

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [title, setTitle] = useState("Procesando autenticación…");
  const [detail, setDetail] = useState<string>("Verificando tu enlace…");
  const [tech, setTech] = useState<any>(null);

  const url = useMemo(() => new URL(window.location.href), []);
  const qs = useMemo(() => url.searchParams, [url]);
  const hs = useMemo(() => parseHashParams(url.hash), [url]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        setStatus("loading");
        setTitle("Auth Callback");
        setDetail("Verificando token…");

        // 0) Si Supabase manda errores en query
        const qpError = qs.get("error");
        const qpErrorDesc = qs.get("error_description");
        if (qpError || qpErrorDesc) {
          throw new Error(`${qpError || "auth_error"}: ${safeDecode(qpErrorDesc || "")}`.trim());
        }

        // 1) PKCE / OAuth code
        const code = qs.get("code");
        if (code) {
          setDetail("Intercambiando código por sesión…");
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;

          // Limpia query (evita re-procesar al refrescar)
          window.history.replaceState({}, document.title, url.pathname);
          if (cancelled) return;

          setStatus("success");
          setTitle("Listo ✅");
          setDetail("Sesión creada correctamente. Redirigiendo…");
          setTech({ flow: "exchangeCodeForSession", data });
          setTimeout(() => navigate("/app", { replace: true }), 700);
          return;
        }

        // 2) token_hash + type (magic links / invites / recovery)
        const token_hash = qs.get("token_hash") || qs.get("token") || "";
        const typeRaw = (qs.get("type") || "").toLowerCase();
        const type = (typeRaw as OtpType) || null;

        if (token_hash && type) {
          setDetail(`Validando enlace (${type})…`);
          const { data, error } = await supabase.auth.verifyOtp({
            token_hash,
            type,
          });
          if (error) throw error;

          // Limpia query (evita re-procesar al refrescar)
          window.history.replaceState({}, document.title, url.pathname);
          if (cancelled) return;

          setStatus("success");
          setTitle("Listo ✅");
          setDetail("Verificación exitosa. Redirigiendo…");
          setTech({ flow: "verifyOtp", data, type });
          setTimeout(() => navigate("/app", { replace: true }), 700);
          return;
        }

        // 3) Fallback legacy: access_token en hash
        const access_token = hs.get("access_token");
        const refresh_token = hs.get("refresh_token");

        if (access_token && refresh_token) {
          setDetail("Estableciendo sesión…");
          const { data, error } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });
          if (error) throw error;

          window.history.replaceState({}, document.title, url.pathname);
          if (cancelled) return;

          setStatus("success");
          setTitle("Listo ✅");
          setDetail("Sesión establecida. Redirigiendo…");
          setTech({ flow: "setSession", data });
          setTimeout(() => navigate("/app", { replace: true }), 700);
          return;
        }

        // 4) Si no hay nada, intenta ver si ya hay sesión
        setDetail("Comprobando sesión existente…");
        const { data: s } = await supabase.auth.getSession();

        if (s?.session) {
          window.history.replaceState({}, document.title, url.pathname);
          if (cancelled) return;

          setStatus("success");
          setTitle("Listo ✅");
          setDetail("Ya estabas autenticado. Redirigiendo…");
          setTech({ flow: "getSession", session: true });
          setTimeout(() => navigate("/app", { replace: true }), 500);
          return;
        }

        throw new Error("No se encontraron parámetros de autenticación (token_hash/type/code) en el callback.");
      } catch (err: any) {
        if (cancelled) return;

        setStatus("error");
        setTitle("Error");
        setDetail(humanMessage(err));
        setTech(err);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [navigate, qs, hs, url.pathname]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#0b1020",
        padding: 16,
      }}
    >
      <div
        style={{
          width: "min(860px, 96vw)",
          background: "white",
          borderRadius: 16,
          padding: 24,
          boxShadow: "0 20px 60px rgba(0,0,0,.35)",
        }}
      >
        <h2 style={{ margin: 0, fontSize: 22 }}>{title}</h2>

        <div style={{ marginTop: 12 }}>
          {status === "loading" && (
            <p style={{ margin: 0, color: "#111827" }}>
              <b>Procesando…</b> {detail}
            </p>
          )}

          {status === "success" && (
            <p style={{ margin: 0, color: "#065f46" }}>
              <b>OK.</b> {detail}
            </p>
          )}

          {status === "error" && (
            <>
              <p style={{ margin: 0, color: "#b91c1c" }}>
                <b>Error</b>
              </p>
              <p style={{ marginTop: 6, color: "#111827" }}>{detail}</p>

              <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
                <button
                  onClick={() => navigate("/login", { replace: true })}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 12,
                    border: "1px solid #e5e7eb",
                    background: "#111827",
                    color: "white",
                    cursor: "pointer",
                  }}
                >
                  Ir a Login
                </button>

                <button
                  onClick={() => navigate("/", { replace: true })}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 12,
                    border: "1px solid #e5e7eb",
                    background: "#10b981",
                    color: "white",
                    cursor: "pointer",
                  }}
                >
                  Ir al inicio
                </button>
              </div>
            </>
          )}
        </div>

        {/* Debug técnico (útil en prod) */}
        {tech ? (
          <details style={{ marginTop: 16 }}>
            <summary style={{ cursor: "pointer" }}>Detalle técnico</summary>
            <pre style={{ marginTop: 10, whiteSpace: "pre-wrap" }}>
              {JSON.stringify(tech, null, 2)}
            </pre>
          </details>
        ) : null}
      </div>
    </div>
  );
}
