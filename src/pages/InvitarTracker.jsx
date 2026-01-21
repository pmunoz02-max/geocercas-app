import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext"; // <- evita alias @/ si tu build no lo soporta
import { useTranslation } from "react-i18next";
import { listPersonal } from "../lib/personalApi.js";

async function safeJsonFromResponse(res) {
  const text = await res.text();
  if (!text || !text.trim()) return { json: null, raw: "" };
  try {
    return { json: JSON.parse(text), raw: text };
  } catch {
    return { json: null, raw: text };
  }
}

async function callInviteTrackerAPI(payload) {
  const url = "/api/invite-tracker";

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      credentials: "include", // 🔑 manda tg_at/tg_rt
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (networkErr) {
    return {
      ok: false,
      status: 0,
      data: {
        error: "Network error calling /api/invite-tracker",
        details: String(networkErr?.message || networkErr),
      },
      url,
      raw: null,
    };
  }

  const { json, raw } = await safeJsonFromResponse(res);
  return { ok: res.ok, status: res.status, data: json ?? (raw ? { raw } : null), url, raw };
}

function personLabel(p) {
  const nombre = `${p?.nombre ?? ""} ${p?.apellido ?? ""}`.trim();
  const email = String(p?.email ?? "").trim();
  return `${nombre || "—"} — ${email || "—"}`.trim();
}

export default function InvitarTracker() {
  const { currentOrg, ready, isLoggedIn } = useAuth();
  const { t } = useTranslation();

  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);

  const [peopleList, setPeopleList] = useState([]);
  const [selectedPersonId, setSelectedPersonId] = useState("");

  const [loadingPeople, setLoadingPeople] = useState(false);
  const [peopleError, setPeopleError] = useState("");

  const [message, setMessage] = useState(null); // { type, text }
  const [actionLink, setActionLink] = useState("");
  const [inviteDiag, setInviteDiag] = useState(null);

  const selectedPersonLabel = useMemo(() => {
    const p = peopleList.find((x) => String(x.id) === String(selectedPersonId));
    return p?.label || "";
  }, [peopleList, selectedPersonId]);

  async function loadPeople() {
    if (!isLoggedIn || !currentOrg?.id) return;

    setLoadingPeople(true);
    setPeopleError("");

    try {
      const rows = await listPersonal({ q: "", onlyActive: true, limit: 500 });

      const normalized = (Array.isArray(rows) ? rows : [])
        .filter((r) => r?.vigente === true || r?.vigente === 1)
        .map((r) => ({
          id: r.id,
          email: String(r?.email ?? "").trim(),
          label: personLabel(r),
        }))
        .filter((x) => x.id && x.email)
        .sort((a, b) => a.label.localeCompare(b.label, "es", { sensitivity: "base" }));

      setPeopleList(normalized);
    } catch (e) {
      console.error("[InvitarTracker] loadPeople error:", e);
      setPeopleList([]);
      setPeopleError(
        e?.message ||
          t("inviteTracker.errors.loadPeople", { defaultValue: "Error loading active personnel." })
      );
    } finally {
      setLoadingPeople(false);
    }
  }

  useEffect(() => {
    if (!ready || !isLoggedIn || !currentOrg?.id) return;
    loadPeople();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, isLoggedIn, currentOrg?.id]);

  function handleSelectPerson(e) {
    const id = e.target.value;
    setSelectedPersonId(id);

    const p = peopleList.find((x) => String(x.id) === String(id));
    if (p?.email) setEmail(String(p.email).toLowerCase());
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage(null);
    setActionLink("");
    setInviteDiag(null);

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

      const resp = await callInviteTrackerAPI({
        email: cleanEmail,
        org_id: currentOrg.id,
      });

      if (!resp.ok) {
        setInviteDiag({
          status: resp.status,
          url: resp.url,
          body: resp.data,
          raw: resp.raw || null,
        });

        let friendly = "Server error (5xx).";
        if (resp.status === 0) friendly = "Network error contacting invitation server.";
        if (resp.status === 401) friendly = "Unauthorized (session/token). Please re-login.";
        if (resp.status === 404) friendly = "API endpoint not found (404).";
        if (resp.status >= 500) friendly = "Server error (5xx).";

        const serverMsg =
          resp?.data?.error ||
          resp?.data?.message ||
          resp?.data?.data?.error ||
          resp?.data?.data?.message ||
          (resp?.data?.raw ? String(resp.data.raw).slice(0, 220) : "") ||
          (resp?.raw ? String(resp.raw).slice(0, 220) : "");

        setMessage({
          type: "error",
          text: serverMsg ? `${friendly} — ${serverMsg}` : friendly,
        });
        return;
      }

      const proxyPayload = resp.data;
      const inner = proxyPayload?.data ?? null;

      if (!proxyPayload?.ok) {
        setInviteDiag({
          status: proxyPayload?.status ?? resp.status,
          url: resp.url,
          body: proxyPayload,
          raw: resp.raw || null,
        });

        const innerErr =
          inner?.error ||
          inner?.message ||
          proxyPayload?.error ||
          proxyPayload?.message ||
          "Invitation failed.";

        setMessage({ type: "error", text: String(innerErr) });
        return;
      }

      const via = inner?.invited_via; // "email" | "action_link"
      const link = inner?.action_link || "";

      if (via === "email") {
        setMessage({ type: "success", text: `✅ Invitación enviada por correo a ${cleanEmail}.` });
      } else if (link) {
        setActionLink(link);
        setMessage({
          type: "warn",
          text: `⚠️ No se pudo enviar correo automáticamente. Copia el Magic Link y envíalo a: ${cleanEmail}`,
        });
      } else {
        setInviteDiag({ status: resp.status, url: resp.url, body: proxyPayload, raw: resp.raw || null });
        setMessage({
          type: "warn",
          text: "✅ Invitación procesada, pero la respuesta no incluyó detalles (invited_via/action_link).",
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

              <div className="text-[11px] text-slate-500 mt-1">
                {t("inviteTracker.form.peopleCount", { defaultValue: "Activos:" })}{" "}
                <span className="font-semibold">{peopleList.length}</span>
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
                {peopleList.length > 0 ? "Selecciona una persona activa" : "(No hay personal activo)"}
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
          {sending ? "Enviando…" : "Send invitation"}
        </button>

        {message && <div className={`text-sm ${msgClass}`}>{message.text}</div>}

        {inviteDiag && (
          <div className="text-xs bg-slate-50 border rounded p-3">
            <div className="font-semibold mb-1">Invite server diagnostic</div>
            <div>
              Status: <span className="font-semibold">{inviteDiag.status}</span>
            </div>
            <div className="break-all">URL: {inviteDiag.url}</div>
            <div className="mt-2 font-semibold">Body:</div>
            <pre className="mt-1 whitespace-pre-wrap break-words bg-white border rounded p-2">
              {JSON.stringify(inviteDiag.body, null, 2)}
            </pre>
          </div>
        )}

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
