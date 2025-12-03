// src/pages/InvitarTracker.jsx
import React, { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "../supabaseClient";

export default function InvitarTracker() {
  const { currentOrg } = useAuth();

  // Estados
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState(null);

  // Personal vigente
  const [personalList, setPersonalList] = useState([]);
  const [selectedPersonId, setSelectedPersonId] = useState("");

  const orgName = currentOrg?.name || "tu organización";

  // ============================================================
  // Cargar PERSONAL vigente
  // ============================================================
  useEffect(() => {
    async function loadPersonal() {
      if (!currentOrg?.id) return;

      const { data, error } = await supabase
        .from("personal")
        .select("id, nombre, email")
        .eq("org_id", currentOrg.id)
        .eq("vigente", true)
        .eq("is_deleted", false)
        .order("nombre", { ascending: true });

      if (error) {
        console.error("[InvitarTracker] Error cargando personal:", error);
        return;
      }

      setPersonalList(data || []);
    }

    loadPersonal();
  }, [currentOrg?.id]);

  // Cuando el usuario selecciona un personal
  function handleSelectPerson(e) {
    const id = e.target.value;
    setSelectedPersonId(id);

    if (!id) {
      // Limpia si no se selecciona nada
      return;
    }

    const p = personalList.find((x) => x.id === id);
    if (p?.email) {
      setEmail(p.email.toLowerCase());
    }
  }

  // Si el usuario escribe manualmente un email, anulamos la selección del dropdown
  function handleEmailChange(e) {
    setEmail(e.target.value);
    setSelectedPersonId("");
  }

  // ============================================================
  // Enviar invitación
  // ============================================================
  async function handleSubmit(e) {
    e.preventDefault();
    setMessage(null);

    const trimmedEmail = (email || "").trim().toLowerCase();

    if (!trimmedEmail) {
      setMessage({
        type: "error",
        text: "Ingresa un correo electrónico.",
      });
      return;
    }

    try {
      setSending(true);

      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: {
          email: trimmedEmail,
          role_name: "tracker",
          full_name: null,
          org_id: currentOrg?.id ?? null,
        },
      });

      if (error) {
        console.error("[InvitarTracker] Edge error:", error);
        setMessage({
          type: "error",
          text:
            error.message ||
            "Hubo un problema al contactar al servidor de invitaciones.",
        });
        return;
      }

      if (!data?.ok) {
        const errText =
          data?.error ||
          "No se pudo completar la invitación. Revisa el correo e intenta nuevamente.";
        console.warn("[InvitarTracker] respuesta no-ok:", data);
        setMessage({
          type: "error",
          text: errText,
        });
        return;
      }

      const mode = data.mode;

      if (mode === "invited") {
        setMessage({
          type: "success",
          text: `Invitación enviada a ${
            data.email || trimmedEmail
          } como tracker en ${orgName}.`,
        });
      } else if (mode === "magiclink_sent") {
        setMessage({
          type: "success",
          text: `El usuario ya estaba registrado. Se envió Magic Link de acceso a ${
            data.email || trimmedEmail
          }.`,
        });
      } else if (mode === "link_only") {
        const link = data.invite_link;
        setMessage({
          type: "success",
          text: link
            ? `No se pudo enviar el correo, pero se generó el enlace: ${link}`
            : `Se generó la invitación, pero no se pudo recuperar el link.`,
        });
      } else if (mode === "created_without_email") {
        setMessage({
          type: "success",
          text:
            "Se creó el usuario sin enviar correo. Revisa Supabase para completarlo.",
        });
      } else {
        setMessage({
          type: "success",
          text: `Invitación procesada para ${
            data.email || trimmedEmail
          }.`,
        });
      }

      setEmail("");
      setSelectedPersonId("");
    } catch (err) {
      console.error("[InvitarTracker] exception:", err);
      setMessage({
        type: "error",
        text: "Hubo un problema de red. Intenta nuevamente.",
      });
    } finally {
      setSending(false);
    }
  }

  // ============================================================
  // UI
  // ============================================================
  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 mb-3">
        Invitar tracker
      </h1>

      <p className="text-sm md:text-base text-slate-600 mb-6">
        Selecciona un miembro de tu personal o ingresa un correo manualmente
        para invitarlo como <span className="font-semibold">tracker</span> en{" "}
        <span className="font-semibold">{orgName}</span>.
      </p>

      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4"
      >
        {/* SELECT DE PERSONAL */}
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            Selecciona personal vigente (opcional)
          </label>
          <select
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={selectedPersonId}
            onChange={handleSelectPerson}
          >
            <option value="">-- Seleccionar personal --</option>
            {personalList.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre} — {p.email}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-slate-500">
            Si seleccionas un personal, su correo se llenará automáticamente.
          </p>
        </div>

        {/* CAMPO EMAIL */}
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
            onChange={handleEmailChange}
          />
          <p className="mt-1 text-[11px] text-slate-500">
            Se enviará una invitación a este correo.
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
              message.type === "success" ? "text-emerald-700" : "text-red-600"
            }`}
          >
            {message.text}
          </div>
        )}
      </form>
    </div>
  );
}
