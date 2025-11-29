// src/pages/InvitarTracker.jsx
import React, { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/supabaseClient";

export default function InvitarTracker() {
  const { currentOrg } = useAuth();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState(null);

  const orgName = currentOrg?.name || "tu organización";
  const orgId = currentOrg?.id || null;

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage(null);

    if (!email) {
      setMessage({ type: "error", text: "Ingresa un correo electrónico." });
      return;
    }

    if (!orgId) {
      setMessage({
        type: "error",
        text:
          "No se pudo determinar la organización actual. " +
          "Verifica que tengas una organización activa o contacta al administrador.",
      });
      return;
    }

    try {
      setSending(true);

      const { data, error } = await supabase.functions.invoke(
        "invite_tracker",
        {
          body: {
            email: email.trim(),
            org_id: orgId,
          },
        }
      );

      if (error) {
        console.error("[InvitarTracker] Edge error:", error);
        setMessage({
          type: "error",
          text:
            error.message ||
            "Hubo un problema al enviar la invitación. Intenta de nuevo.",
        });
        return;
      }

      if (!data?.ok) {
        const errText =
          data?.error ||
          "No se pudo completar la invitación. Revisa los datos e intenta nuevamente.";
        setMessage({
          type: "error",
          text: errText,
        });
        return;
      }

      setMessage({
        type: "success",
        text: `Invitación enviada a ${data.email || email}. Pídeles que revisen su correo para abrir el Magic Link.`,
      });
      setEmail("");
    } catch (err) {
      console.error("[InvitarTracker] exception:", err);
      setMessage({
        type: "error",
        text: "Hubo un problema de red al enviar la invitación.",
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
            Se enviará un Magic Link a este correo para que se conecte como
            tracker a tu organización.
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
