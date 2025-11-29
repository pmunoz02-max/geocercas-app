// src/pages/InvitarTracker.jsx
import React, { useState } from "react";
import { useAuth } from "@/context/AuthContext";

export default function InvitarTracker() {
  const { currentOrg } = useAuth();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState(null);

  const orgName = currentOrg?.name || "tu organización";

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage(null);

    if (!email) {
      setMessage({ type: "error", text: "Ingresa un correo electrónico." });
      return;
    }

    try {
      setSending(true);

      // 🔧 Aquí más adelante conectaremos con tu Edge Function / API real
      await new Promise((resolve) => setTimeout(resolve, 600));

      setMessage({
        type: "success",
        text: `Invitación simulada enviada a ${email}. Luego conectaremos este formulario con la API real.`,
      });
      setEmail("");
    } catch (err) {
      console.error(err);
      setMessage({
        type: "error",
        text: "Hubo un problema al enviar la invitación.",
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 mb-3">
        Invitar tracker
      </h1>
      <p className="text-sm md:text-base text-slate-600 mb-6">
        Envía una invitación por correo electrónico para que un nuevo usuario se
        una como <span className="font-semibold">tracker</span> en{" "}
        <span className="font-semibold">{orgName}</span>.
      </p>

      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4"
      >
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            Correo electrónico del tracker
          </label>
          <input
            type="email"
            required
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            placeholder="tracker@ejemplo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <p className="mt-1 text-[11px] text-slate-500">
            Más adelante conectaremos este formulario con el envío real de
            invitaciones (magic link / signup).
          </p>
        </div>

        <button
          type="submit"
          disabled={sending}
          className="inline-flex items-center justify-center px-4 py-2 rounded-md text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {sending ? "Enviando..." : "Enviar invitación"}
        </button>

        {message && (
          <div
            className={`mt-2 text-sm ${
              message.type === "success"
                ? "text-emerald-700"
                : "text-red-600"
            }`}
          >
            {message.text}
          </div>
        )}
      </form>
    </div>
  );
}
