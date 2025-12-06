// src/pages/InvitarTracker.jsx
import React, { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "../supabaseClient";
import { useTranslation } from "react-i18next";

export default function InvitarTracker() {
  const { currentOrg } = useAuth();
  const { t } = useTranslation();

  const orgName =
    currentOrg?.name || t("inviteTracker.orgFallback", "your organization");

  // Estados
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState(null);

  // Personal vigente
  const [personalList, setPersonalList] = useState([]);
  const [selectedPersonId, setSelectedPersonId] = useState("");

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
        text: t("inviteTracker.errors.emailRequired"),
      });
      return;
    }

    // Validación simple de formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setMessage({
        type: "error",
        text: t("inviteTracker.errors.emailInvalid"),
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
        console.error("[InvitarTracker] Error al invocar invite-user:", error);
        setMessage({
          type: "error",
          text:
            error.message ||
            t(
              "inviteTracker.messages.serverProblem",
              "There was a problem contacting the invitation server."
            ),
        });
        return;
      }

      if (!data?.ok) {
        const errText =
          data?.error ||
          t(
            "inviteTracker.messages.notOk",
            "The invitation could not be completed. Check the email and try again."
          );
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
          text: t("inviteTracker.messages.invited", {
            email: data.email || trimmedEmail,
            orgName,
          }),
        });
      } else if (mode === "magiclink_sent") {
        setMessage({
          type: "success",
          text: t("inviteTracker.messages.magiclinkSent", {
            email: data.email || trimmedEmail,
          }),
        });
      } else if (mode === "link_only") {
        const link = data.invite_link;
        setMessage({
          type: "success",
          text: link
            ? t("inviteTracker.messages.linkOnlyWithLink", { link })
            : t("inviteTracker.messages.linkOnlyNoLink"),
        });
      } else if (mode === "created_without_email") {
        setMessage({
          type: "success",
          text: t("inviteTracker.messages.createdWithoutEmail"),
        });
      } else {
        setMessage({
          type: "success",
          text: t("inviteTracker.messages.genericProcessed", {
            email: data.email || trimmedEmail,
          }),
        });
      }

      setEmail("");
      setSelectedPersonId("");
    } catch (err) {
      console.error("[InvitarTracker] Error inesperado:", err);
      setMessage({
        type: "error",
        text:
          err.message ||
          t(
            "inviteTracker.messages.unexpectedError",
            "Unexpected error while processing the invitation."
          ),
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 mb-3">
        {t("inviteTracker.title")}
      </h1>

      <p className="text-sm md:text-base text-slate-600 mb-6">
        {t("inviteTracker.subtitle", { orgName })}
      </p>

      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4"
      >
        {/* SELECT DE PERSONAL */}
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            {t("inviteTracker.form.selectLabel")}
          </label>
          <select
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={selectedPersonId}
            onChange={handleSelectPerson}
          >
            <option value="">
              {t("inviteTracker.form.selectPlaceholder")}
            </option>
            {personalList.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre} — {p.email}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-slate-500">
            {t("inviteTracker.form.selectHelp")}
          </p>
        </div>

        {/* CAMPO EMAIL */}
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            {t("inviteTracker.form.emailLabel")}
          </label>
          <input
            type="email"
            required
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            placeholder={t(
              "inviteTracker.form.emailPlaceholder",
              "tracker@example.com"
            )}
            value={email}
            onChange={handleEmailChange}
          />
          <p className="mt-1 text-[11px] text-slate-500">
            {t("inviteTracker.form.emailHelp")}
          </p>
        </div>

        {/* BOTÓN */}
        <button
          type="submit"
          disabled={sending}
          className="w-full inline-flex justify-center items-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {sending
            ? t("inviteTracker.form.buttonSending")
            : t("inviteTracker.form.buttonSend")}
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
