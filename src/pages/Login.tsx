// src/pages/Login.tsx
import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/supabaseClient";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();

  const [emailPwd, setEmailPwd] = useState("");
  const [password, setPassword] = useState("");
  const [emailMagic, setEmailMagic] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // ---------------------------------------------
  // 1) Al cargar la página:
  //    - Si hay ?code=... en la URL (MagicLink),
  //      hacemos exchangeCodeForSession.
  //    - Si ya hay sesión, mandamos a flujo interno.
  // ---------------------------------------------
  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setMsg(null);
      setErrorMsg(null);

      const url = new URL(window.location.href);
      const hasCode = url.searchParams.get("code");

      try {
        if (hasCode) {
          // Caso Magic Link: intercambiar el código por una sesión
          const { error } = await supabase.auth.exchangeCodeForSession(
            url.search
          );
          if (error) {
            console.error("[Login] exchangeCodeForSession error:", error);
            setErrorMsg("No se pudo validar el enlace mágico. Intenta de nuevo.");
            setLoading(false);
            return;
          }

          // Sesión creada correctamente → ir al flujo interno
          navigate("/seleccionar-organizacion", { replace: true });
          return;
        }

        // Si no hay code, revisar si ya existe una sesión activa
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          console.error("[Login] getSession error:", error);
        }

        if (data?.session) {
          // Usuario ya autenticado → ir al flujo interno
          navigate("/seleccionar-organizacion", {
            replace: true,
            state: { from: location },
          });
          return;
        }
      } finally {
        setLoading(false);
      }
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------
  // 2) Login con email + password
  // ---------------------------------------------
  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    setErrorMsg(null);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: emailPwd,
        password,
      });

      if (error) {
        console.error("[Login] signInWithPassword error:", error);
        setErrorMsg(
          error.message === "Invalid login credentials"
            ? "Correo o contraseña incorrectos."
            : "No se pudo iniciar sesión. Inténtalo nuevamente."
        );
        return;
      }

      // Sesión creada → ir al flujo interno
      navigate("/seleccionar-organizacion", { replace: true });
    } finally {
      setLoading(false);
    }
  }

  // ---------------------------------------------
  // 3) Login con Magic Link
  // ---------------------------------------------
  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    setErrorMsg(null);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: emailMagic,
        options: {
          emailRedirectTo: `${window.location.origin}/login`,
        },
      });

      if (error) {
        console.error("[Login] signInWithOtp error:", error);
        setErrorMsg("No se pudo enviar el Magic Link. Revisa el correo.");
        return;
      }

      setMsg(
        "Te hemos enviado un enlace mágico a tu correo. Revísalo y haz clic para entrar."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-slate-100 p-6 space-y-6">
        <h1 className="text-2xl font-bold text-slate-800 mb-2">
          Iniciar sesión
        </h1>

        {/* MENSAJES */}
        {errorMsg && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {errorMsg}
          </div>
        )}
        {msg && (
          <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
            {msg}
          </div>
        )}

        {/* LOGIN CON PASSWORD */}
        <form onSubmit={handlePasswordLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Email
            </label>
            <input
              className="w-full border rounded px-3 py-2 text-sm"
              type="email"
              value={emailPwd}
              onChange={(e) => setEmailPwd(e.target.value)}
              required
              placeholder="tu@correo.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Contraseña
            </label>
            <input
              className="w-full border rounded px-3 py-2 text-sm"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 rounded bg-blue-600 text-white text-sm font-medium disabled:opacity-60 hover:bg-blue-700 transition"
          >
            {loading ? "Ingresando…" : "Entrar"}
          </button>
        </form>

        {/* SEPARADOR */}
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <div className="flex-1 h-px bg-slate-200" />
          <span>o</span>
          <div className="flex-1 h-px bg-slate-200" />
        </div>

        {/* LOGIN CON MAGIC LINK */}
        <form onSubmit={handleMagicLink} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Email
            </label>
            <input
              className="w-full border rounded px-3 py-2 text-sm"
              type="email"
              value={emailMagic}
              onChange={(e) => setEmailMagic(e.target.value)}
              required
              placeholder="tu@correo.com"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 rounded bg-emerald-600 text-white text-sm font-medium disabled:opacity-60 hover:bg-emerald-700 transition"
          >
            {loading ? "Enviando…" : "Entrar con Magic Link"}
          </button>
        </form>
      </div>
    </div>
  );
}
