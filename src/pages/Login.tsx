// src/pages/Login.tsx
import React, { useEffect, useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { useAuth } from "../context/AuthContext";

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, currentOrg, loading } = useAuth();

  const [email, setEmail] = useState<string>("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Si ya estoy autenticado y tengo organización → ir al dashboard
  useEffect(() => {
    if (loading) return;

    if (user && currentOrg) {
      navigate("/", { replace: true });
    }
  }, [user, currentOrg, loading, navigate]);

  // Usuario autenticado pero sin organización (caso raro)
  if (!loading && user && !currentOrg) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-100">
        <div className="max-w-xl w-full bg-slate-800 rounded-xl shadow-lg p-6">
          <h1 className="text-2xl font-semibold mb-4">
            No tienes ninguna organización asignada
          </h1>
          <p className="mb-2">
            Tu usuario está autenticado, pero todavía no está asociado a
            ninguna organización activa.
          </p>
          <p className="text-sm text-slate-300">
            Pide a un administrador que te agregue a una organización o crea
            una nueva desde el panel de administración.
          </p>
        </div>
      </div>
    );
  }

  async function handleSendLink(e: FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setMessage(null);

    if (!email) {
      setErrorMsg("Por favor ingresa tu correo.");
      return;
    }

    try {
      setSending(true);
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
        },
      });

      if (error) {
        console.error("[LoginPage] signInWithOtp error:", error);
        setErrorMsg(error.message || "No se pudo enviar el enlace.");
      } else {
        setMessage(
          "Te hemos enviado un enlace de acceso a tu correo. Revisa tu bandeja de entrada (y spam)."
        );
      }
    } catch (err) {
      console.error("[LoginPage] signInWithOtp exception:", err);
      setErrorMsg("Ocurrió un error inesperado.");
    } finally {
      setSending(false);
    }
  }

  // Mientras AuthContext carga sesión/perfil
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-100">
        <div className="text-center">
          <p className="text-lg mb-2">Cargando…</p>
          <p className="text-sm text-slate-400">
            Verificando tu sesión, por favor espera.
          </p>
        </div>
      </div>
    );
  }

  // Formulario de login (sin usuario)
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-100">
      <div className="max-w-md w-full bg-slate-800 rounded-2xl shadow-xl p-6">
        <h1 className="text-2xl font-semibold mb-2 text-center">
          App Geocercas
        </h1>
        <p className="text-sm text-slate-300 mb-6 text-center">
          Ingresa tu correo para recibir un enlace de acceso.
        </p>

        <form onSubmit={handleSendLink} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-slate-200 mb-1"
            >
              Correo electrónico
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              className="
                w-full rounded-lg border border-slate-600
                bg-slate-900 px-3 py-2 text-sm
                focus:outline-none focus:ring-2 focus:ring-emerald-500
                text-white !text-white [color:white] placeholder-slate-300
              "
              style={{ color: "white" }}
              placeholder="tucorreo@empresa.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {errorMsg && (
            <div className="rounded-md bg-red-900/40 border border-red-600 px-3 py-2 text-sm text-red-200">
              {errorMsg}
            </div>
          )}

          {message && (
            <div className="rounded-md bg-emerald-900/40 border border-emerald-600 px-3 py-2 text-sm text-emerald-200">
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={sending}
            className="w-full inline-flex items-center justify-center rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 disabled:cursor-not-allowed px-4 py-2 text-sm font-semibold text-white"
          >
            {sending ? "Enviando enlace…" : "Enviar enlace de acceso"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;
