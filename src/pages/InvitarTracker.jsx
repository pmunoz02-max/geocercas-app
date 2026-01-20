import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "../supabaseClient.js";
import { useTranslation } from "react-i18next";

async function callInviteTracker(payload) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return { ok: false, status: 401, data: { error: "No session token" } };
  }

  const res = await fetch(
    `${String(supabaseUrl || "").replace(/\/$/, "")}/functions/v1/invite_tracker`,
    {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  const json = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data: json };
}

// Helpers universales para normalizar “personal activo” aunque la vista cambie columnas
function pickId(row) {
  return (
    row?.org_people_id ??
    row?.org_person_id ??
    row?.org_personnel_id ??
    row?.personal_id ??
    row?.person_id ??
    row?.id ??
    null
  );
}

function pickEmail(row) {
  return row?.email ?? row?.correo ?? row?.mail ?? "";
}

function pickFirstName(row) {
  return row?.nombre ?? row?.first_name ?? row?.firstname ?? row?.name ?? "";
}

function pickLastName(row) {
  return row?.apellido ?? row?.last_name ?? row?.lastname ?? row?.surname ?? "";
}

// Activo = no borrado y no desactivado (soporta múltiples esquemas)
function isActiveRow(row) {
  const deleted =
    row?.is_deleted ?? row?.deleted ?? row?.isDeleted ?? row?.is_removed ?? row?.removed ?? false;

  const active =
    row?.active ?? row?.is_active ?? row?.isActive ?? row?.enabled ?? row?.is_enabled ?? true;

  return deleted !== true && active !== false;
}

function formatPersonLabel(row) {
  const first = pickFirstName(row);
  const last = pickLastName(row);
  const email = pickEmail(row);
  const full = `${first} ${last}`.trim();
  return `${full || "—"} — ${email || "—"}`.trim();
}

export default function InvitarTracker() {
  const { currentOrg, ready } = useAuth();
  const { t } = useTranslation();

  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);

  const [peopleList, setPeopleList] = useState([]); // [{ id, label, email, raw }]
  const [selectedPersonId, setSelectedPersonId] = useState("");

  const [message, setMessage] = useState(null); // { type: "success"|"error"|"warn", text }
  const [actionLink, setActionLink] = useState("");

  const [loadingPeople, setLoadingPeople] = useState(false);
  const [peopleError, setPeopleError] = useState("");

  const selectedPersonLabel = useMemo(() => {
    const p = peopleList.find((x) => String(x.id) === String(selectedPersonId));
    return p?.label || "";
  }, [peopleList, selectedPersonId]);

  async function loadPeople() {
    if (!currentOrg?.id) return;

    setLoadingPeople(true);
    setPeopleError("");

    // IMPORTANTE: select("*") para no depender de nombres exactos de columnas en la vista
    const { data, error } = await supabase
      .from("v_org_people_ui")
      .select("*")
      .eq("org_id", currentOrg.id)
      .limit(500);

    if (error) {
      console.error("[InvitarTracker] loadPeople error:", error);
      setPeopleList([]);
      setPeopleError(error.message || "Error loading personnel");
      setLoadingPeople(false);
      return;
    }

    const rows = Array.isArray(data) ? data : [];

    // Normaliza a una lista consistente para el select
    const normalized = rows
      .filter(isActiveRow)
      .map((r) => {
        const id = pickId(r);
        const em = pickEmail(r);
        return {
          id,
          email: em,
          label: formatPersonLabel(r),
          raw: r,
        };
      })
      .filter((x) => x.id && x.email) // drop list solo con items válidos (con id y email)
      .sort((a, b) => a.label.localeCompare(b.label, "es", { sensitivity: "base" }));

    setPeopleList(normalized);
    setLoadingPeople(false);
  }

  useEffect(() => {
    if (!ready) return;
    loadPeople();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, currentOrg?.id]);

  function handleSelectPerson(e) {
    const id = e.target.value;
    setSelectedPersonId(id);

    const p = peopleList.find((x) => String(x.id) === String(id));
    if (p?.email) setEmail(String(p.email).trim().toLowerCase());
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage(null);
    setActionLink("");

    const cleanEmail = String(email || "").trim().toLowerCase();

    if (!cleanEmail || !cleanEmail.includes("@")) {
      setMessage({
        type: "error",
        text: t("inviteTracker.errors.emailInvalid", { defaultValue: "Email inválido." }),
      });
      return;
    }

    if (!currentOrg?.id) {
      setMessage({
        type: "error",
        text: t("inviteTracker.errors.noOrg", { defaultValue: "No hay organización activa." }),
      });
      return;
    }

    try {
      setSending(true);

      const resp = await callInviteTracker({
        email: cleanEmail,
        org_id: currentOrg.id,
      });

      if (!resp.ok || !resp.data) {
        setMessage({
          type: "error",
          text: t("inviteTracker.messages.serverProblem", { defaultValue: "Problema en servidor." }),
        });
        return;
      }

      const via = resp.data.invited_via; // "email" | "action_link"
      const link = resp.data.action_link || "";

      if (via === "email") {
        setMessage({ type: "success", text: `✅ Invitación enviada por correo a ${cleanEmail}.` });
      } else {
        setActionLink(link);
        setMessage({
          type: "warn",
          text: `⚠️ No se pudo enviar correo automáticamente. Copia el Magic Link y envíalo a: ${cleanEmail}`,
        });
      }

      setEmail("");
      setSelectedPersonId("");
    } catch (err) {
      console.error("[InvitarTracker] unexpected:", err);
      setMessage({
        type: "error",
        text: t("inviteTracker.messages.unexpectedError", { defaultValue: "Error inesperado." }),
      });
    } finally {
      setSending(false);
    }
  }

  const msgClass =
    message?.type === "success"
      ? "text-emerald-700"
      : message?.type === "warn"
      ? "text-amber-700"
      : "text-red-600";

  const hasPeople = peopleList.length > 0;

  if (!ready) {
    return (
      <div className="max-w-lg mx-auto p-4">
        <div className="border rounded px-4 py-3 text-sm text-gray-600">
          {t("common.actions.loading", { defaultValue: "Loading…" })}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-semibold mb-4">
        {t("inviteTracker.title", { defaultValue: "Invitar Tracker" })}
      </h1>

      <form onSubmit={handleSubmit} className="bg-white border rounded-xl p-5 space-y-4">
        {/* Drop list bien implementada */}
        <div className="border rounded-lg p-3 bg-slate-50">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-sm font-semibold">
                {t("inviteTracker.form.selectPersonTitle", { defaultValue: "Seleccionar persona" })}
              </div>

              <div className="text-xs text-slate-600 mt-1">
                {selectedPersonLabel
                  ? selectedPersonLabel
                  : t("inviteTracker.form.selectPersonHint", {
                      defaultValue: "Selecciona una persona activa para autocompletar el email.",
                    })}
              </div>

              <div className="text-[11px] text-slate-500 mt-1">
                {loadingPeople ? (
                  t("inviteTracker.form.loadingPeople", { defaultValue: "Cargando personal…" })
                ) : (
                  <>
                    {t("inviteTracker.form.peopleCount", { defaultValue: "Activos:" })}{" "}
                    <span className="font-semibold">{peopleList.length}</span>
                  </>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={loadPeople}
              className="px-3 py-2 rounded border text-xs bg-white hover:bg-slate-100"
              disabled={loadingPeople}
            >
              {loadingPeople
                ? t("inviteTracker.form.buttonRefreshing", { defaultValue: "Refrescando…" })
                : t("inviteTracker.form.buttonRefreshPeople", { defaultValue: "Refrescar" })}
            </button>
          </div>

          {peopleError && (
            <div className="mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
              <div className="font-semibold">Error cargando personal</div>
              <div className="mt-1 break-words">{peopleError}</div>
            </div>
          )}

          <div className="mt-3">
            <select
              className="w-full border rounded px-3 py-2 text-sm bg-white"
              value={selectedPersonId}
              onChange={handleSelectPerson}
              disabled={loadingPeople || !hasPeople}
            >
              <option value="">
                {loadingPeople
                  ? t("inviteTracker.form.loadingPeople", { defaultValue: "Cargando…" })
                  : hasPeople
                  ? t("inviteTracker.form.selectPlaceholder", {
                      defaultValue: "Selecciona una persona activa",
                    })
                  : t("inviteTracker.form.noPeople", {
                      defaultValue: "No hay personal activo (actívalo en Personal)",
                    })}
              </option>

              {peopleList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Email (autocompleta al elegir persona) */}
        <input
          type="email"
          className="w-full border rounded px-3 py-2 text-sm"
          placeholder="tracker@ejemplo.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <button
          disabled={sending}
          className="w-full bg-emerald-600 text-white rounded px-4 py-2 text-sm"
        >
          {sending
            ? t("inviteTracker.form.buttonSending", { defaultValue: "Enviando…" })
            : t("inviteTracker.form.buttonSend", { defaultValue: "Send invitation" })}
        </button>

        {message && <div className={`text-sm ${msgClass}`}>{message.text}</div>}

        {actionLink ? (
          <div className="text-xs break-all bg-slate-50 border rounded p-3">
            <div className="font-semibold mb-2">Magic Link (tracker)</div>

            <div className="flex gap-2 mb-2">
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(actionLink)}
                className="bg-blue-600 text-white rounded px-3 py-2 text-xs"
              >
                Copiar link
              </button>

              <button
                type="button"
                onClick={() => window.open(actionLink, "_blank", "noopener,noreferrer")}
                className="bg-slate-700 text-white rounded px-3 py-2 text-xs"
              >
                Probar link
              </button>
            </div>

            <div className="bg-white border rounded p-2 select-all">{actionLink}</div>
          </div>
        ) : null}
      </form>
    </div>
  );
}
