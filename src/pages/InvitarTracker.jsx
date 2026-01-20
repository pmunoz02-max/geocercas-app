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

// ---- Normalización universal (tolerante a distintos esquemas/vistas) ----
function pickId(row) {
  return (
    row?.org_people_id ??
    row?.org_person_id ??
    row?.org_personnel_id ??
    row?.org_people_ui_id ??
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

function isActiveRow(row) {
  const deleted =
    row?.is_deleted ?? row?.deleted ?? row?.isDeleted ?? row?.removed ?? row?.is_removed ?? false;

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

// Detecta la columna de organización en la vista, sin suposiciones
function detectOrgKey(sampleRow) {
  if (!sampleRow || typeof sampleRow !== "object") return null;
  const candidates = ["org_id", "tenant_id", "organization_id", "company_id"];
  for (const k of candidates) {
    if (k in sampleRow) return k;
  }
  // fallback por heurística: algún key que termine en "_org_id"
  const keys = Object.keys(sampleRow);
  const heuristic = keys.find((k) => /org_id$/i.test(k));
  return heuristic || null;
}

export default function InvitarTracker() {
  const { currentOrg, ready } = useAuth();
  const { t } = useTranslation();

  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);

  const [peopleList, setPeopleList] = useState([]); // [{ id, email, label }]
  const [selectedPersonId, setSelectedPersonId] = useState("");

  const [message, setMessage] = useState(null); // { type, text }
  const [actionLink, setActionLink] = useState("");

  const [loadingPeople, setLoadingPeople] = useState(false);
  const [peopleError, setPeopleError] = useState("");

  // Diagnóstico visible
  const [stats, setStats] = useState({
    orgKey: null,
    totalRows: 0,
    orgRows: 0,
    activeRows: 0,
  });

  const selectedPersonLabel = useMemo(() => {
    const p = peopleList.find((x) => String(x.id) === String(selectedPersonId));
    return p?.label || "";
  }, [peopleList, selectedPersonId]);

  async function loadPeople() {
    if (!currentOrg?.id) return;

    setLoadingPeople(true);
    setPeopleError("");
    setStats({ orgKey: null, totalRows: 0, orgRows: 0, activeRows: 0 });

    // 👇 Clave: NO filtramos por org_id en SQL porque la vista puede no tener esa columna
    const { data, error } = await supabase
      .from("v_org_people_ui")
      .select("*")
      .limit(1000);

    if (error) {
      console.error("[InvitarTracker] loadPeople error:", error);
      setPeopleList([]);
      setPeopleError(error.message || "Error loading personnel");
      setLoadingPeople(false);
      return;
    }

    const rows = Array.isArray(data) ? data : [];
    const sample = rows[0] || null;
    const orgKey = detectOrgKey(sample);
    const orgId = String(currentOrg.id);

    const rowsForOrg = orgKey
      ? rows.filter((r) => String(r?.[orgKey] ?? "") === orgId)
      : rows; // si no se detecta orgKey, no filtramos (mejor que 0)

    const activeForOrg = rowsForOrg.filter(isActiveRow);

    const normalized = activeForOrg
      .map((r) => {
        const id = pickId(r);
        const em = pickEmail(r);
        return { id, email: em, label: formatPersonLabel(r) };
      })
      .filter((x) => x.id && x.email)
      .sort((a, b) => a.label.localeCompare(b.label, "es", { sensitivity: "base" }));

    setStats({
      orgKey,
      totalRows: rows.length,
      orgRows: rowsForOrg.length,
      activeRows: activeForOrg.length,
    });

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

              {/* Diagnóstico que nos dice por qué “no hay activos” */}
              <div className="text-[11px] text-slate-500 mt-1">
                OrgKey: <span className="font-semibold">{stats.orgKey || "no-detectada"}</span>{" "}
                · Total: <span className="font-semibold">{stats.totalRows}</span> · En esta org:{" "}
                <span className="font-semibold">{stats.orgRows}</span> · Activos:{" "}
                <span className="font-semibold">{stats.activeRows}</span>
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
            >
              <option value="">
                {peopleList.length > 0
                  ? t("inviteTracker.form.selectPlaceholder", { defaultValue: "Selecciona una persona activa" })
                  : t("inviteTracker.form.noPeople", { defaultValue: "(No hay personal activo)" })}
              </option>

              {peopleList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <input
          type="email"
          className="w-full border rounded px-3 py-2 text-sm"
          placeholder="tracker@ejemplo.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <button disabled={sending} className="w-full bg-emerald-600 text-white rounded px-4 py-2 text-sm">
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
