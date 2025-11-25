// src/pages/Auth/Login.jsx
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function Login() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState("");

  const sendMagicLink = async (e) => {
    e.preventDefault();
    setMsg("");
    setSending(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) throw error;
      setMsg("Revisa tu correo y sigue el enlace de acceso.");
    } catch (err) {
      setMsg(err?.message || "No se pudo enviar el Magic Link.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-md mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-4">Iniciar sesión</h1>

      {msg && (
        <div className="mb-3 border rounded p-3 bg-gray-50 text-gray-700">
          {msg}
        </div>
      )}

      <form onSubmit={sendMagicLink} className="space-y-3">
        <input
          type="email"
          required
          placeholder="tu-correo@dominio.com"
          className="w-full border rounded p-2"
          value={email}
          onChange={(e) => setEmail(e.target.value.trim())}
        />
        <button
          disabled={sending}
          className="w-full border rounded p-2 hover:bg-gray-50 disabled:opacity-60"
        >
          {sending ? "Enviando..." : "Enviar Magic Link"}
        </button>
      </form>
    </div>
  );
}
