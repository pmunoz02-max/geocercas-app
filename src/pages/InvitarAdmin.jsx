// src/pages/InvitarAdmin.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/auth.js";
import { supabase } from "../supabaseClient.js";
import { useTranslation } from "react-i18next";

async function callEdgeFunction(fnName, payload) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return { ok: false, status: 401, data: { ok: false, message: "No session token" } };
  }

  const base = String(supabaseUrl || "").replace(/\/$/, "");
  const res = await fetch(`${base}/functions/v1/${fnName}`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload || {}),
  });

  const json = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data: json };
}

async function copyToClipboard(text) {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return { ok: true, method: "clipboard" };
    }
  } catch (e) {}

  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "true");
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    ta.style.left = "-1000px";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return { ok, method: "execCommand" };
  } catch (e) {
    return { ok: false, method: "none" };
  }
}

export default function InvitarAdmin() {
  const { currentOrg, isAppRoot } = useAuth();
  const { t } = useTranslation();

  const [mode, setMode] = useState("invite"); // invite | recovery

  // INVITE ADMIN/OWNER
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("owner"); // âœ… default: owner (nace con org propia)
  const [orgName, setOrgName] = useState("");

  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState(null); // { type, text }
  const [actionLink, setActionLink] = useState("");

  const [peopleList, setPeopleList] = useState([]);
  const [selectedOrgPeopleId, setSelectedOrgPeopleId] = useState("");

  const canInviteAdmin = useMemo(() => !!currentOrg?.id, [currentOrg?.id]);

  // RECOVERY LINK (manual reset)
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [recoveryMsg, setRecoveryMsg] = useState(null); // { type, text }
  const [recoveryLink, setRecoveryLink] = useState("");

  // âœ… Reuse existing i18n placeholder (fixes FR/ES issue centrally)
  const emailPh = t?.("login.emailPlaceholder") || "tu@email.com";

  useEffect(() => {
    async function loadPeople() {
      if (!currentOrg?.id) return;

      const { data, error } = await supabase
        .from("v_org_people_ui")
        .select("org_people_id, nombre, apellido, email, is_deleted")
        .eq("org_id", currentOrg.id)
        .eq("is_deleted", false)
        .order("nombre");

      if (!error) setPeopleList(data || []);
    }
    loadPeople();
  }, [currentOrg?.id]);

  function handleSelectPerson(e) {
    const id = e.target.value;
    setSelectedOrgPeopleId(id);
    const p = peopleList.find((x) => x.org_people_id === id);
    if (p?.email) setEmail(String(p.email).toLowerCase());
  }

  async function handleSubmitInvite(e) {
    e.preventDefault();
    setMessage(null);
    setActionLink("");

    const cleanEmail = String(email || "").trim().toLowerCase();
    const cleanRole = String(role || "").toLowerCase() === "admin" ? "admin" : "owner";

    if (!cleanEmail || !cleanEmail.includes("@")) {
      setMessage({
        type: "error",
        text: t?.("inviteAdmin.errors.emailInvalid") || "Email invÃ¡lido",
      });
      return;
    }

    if (cleanRole === "admin" && !currentOrg?.id) {
      setMessage({
        type: "error",
        text: t?.("inviteAdmin.errors.noOrg") || "No hay organizaciÃ³n activa (currentOrg).",
      });
      return;
    }

    try {
      setSending(true);

      const payload =
        cleanRole === "admin"
          ? { email: cleanEmail, role: "admin", org_id: currentOrg.id }
          : { email: cleanEmail, role: "owner", org_name: String(orgName || "").trim() || cleanEmail };

      const resp = await callEdgeFunction("invite_admin", payload);

      if (!resp.ok || !resp.data) {
        setMessage({
          type: "error",
          text: t?.("inviteAdmin.messages.serverProblem") || "Problema con el servidor. Intenta nuevamente.",
        });
        return;
      }

      if (resp.data?.ok !== true) {
        const msg = resp.data?.message || "No se pudo generar la invitaciÃ³n.";
        setMessage({ type: "error", text: `âŒ ${msg}` });
        return;
      }

      const link = resp.data.action_link || "";
      if (!link) {
        setMessage({
          type: "error",
          text: t?.("inviteAdmin.messages.noLink") || "Se generÃ³ respuesta pero no llegÃ³ action_link.",
        });
        return;
      }

      setActionLink(link);

      const emailStatus = String(resp.data.email_status || "").toLowerCase();
      const sent = emailStatus === "sent";

      setMessage({
        type: sent ? "success" : "warn",
        text: sent
          ? `âœ… Email enviado a ${cleanEmail} con el Magic Link (${cleanRole.toUpperCase()}).`
          : `âœ… Magic Link generado para ${cleanRole.toUpperCase()}: ${cleanEmail}. CÃ³pialo y envÃ­alo por tu canal.`,
      });

      setEmail("");
      setOrgName("");
      setSelectedOrgPeopleId("");
    } catch (err) {
      console.error("[InvitarAdmin] unexpected:", err);
      setMessage({
        type: "error",
        text: t?.("inviteAdmin.messages.unexpectedError") || "Error inesperado. Revisa consola/logs.",
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

  const roleLabel = role === "admin" ? "admin" : "owner";

  async function handleCopy(link) {
    if (!link) return;
    const r = await copyToClipboard(link);
    if (r.ok) {
      setMessage({ type: "success", text: "âœ… Copiado al portapapeles." });
    } else {
      setMessage({
        type: "warn",
        text: "âš ï¸ El navegador bloqueÃ³ el copiado automÃ¡tico. Selecciona el link (abajo) y copia manualmente (Ctrl+C).",
      });
    }
  }

  async function handleGenerateRecovery(e) {
    e.preventDefault();
    setRecoveryMsg(null);
    setRecoveryLink("");

    const cleanEmail = String(recoveryEmail || "").trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setRecoveryMsg({ type: "error", text: "Email invÃ¡lido." });
      return;
    }

    if (!isAppRoot) {
      setRecoveryMsg({ type: "error", text: "Solo App Root puede generar links de recuperaciÃ³n." });
      return;
    }

    try {
      setRecoveryBusy(true);

      const redirect_to = `${window.location.origin}/auth/callback`;

      const resp = await callEdgeFunction("generate_recovery_link", {
        email: cleanEmail,
        redirect_to,
      });

      if (!resp.ok || !resp.data) {
        setRecoveryMsg({ type: "error", text: "Problema con el servidor. Intenta nuevamente." });
        return;
      }

      if (resp.data?.ok !== true) {
        setRecoveryMsg({ type: "error", text: `âŒ ${resp.data?.message || "No se pudo generar el link."}` });
        return;
      }

      const link = resp.data?.action_link || "";
      if (!link) {
        setRecoveryMsg({ type: "error", text: "Respuesta sin action_link." });
        return;
      }

      setRecoveryLink(link);
      setRecoveryMsg({
        type: "warn",
        text: `âœ… Link de recuperaciÃ³n generado para ${cleanEmail}. CÃ³pialo y envÃ­alo por tu canal.`,
      });
      setRecoveryEmail("");
    } catch (e2) {
      console.error("[InvitarAdmin] recovery error:", e2);
      setRecoveryMsg({ type: "error", text: e2?.message || "Error inesperado." });
    } finally {
      setRecoveryBusy(false);
    }
  }

  const recoveryClass =
    recoveryMsg?.type === "success"
      ? "text-emerald-700"
      : recoveryMsg?.type === "warn"
      ? "text-amber-700"
      : "text-red-600";

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold">{t?.("inviteAdmin.title") || "Administrador SaaS"}</h1>
        <p className="text-sm text-slate-600 mt-1">
          {t?.("inviteAdmin.subtitle") ||
            "Invitaciones (Magic Link) y herramientas de soporte del SaaS (solo App Root)."}
        </p>
      </div>

      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={() => setMode("invite")}
          className={
            mode === "invite"
              ? "px-3 py-2 rounded-lg bg-slate-900 text-white text-sm"
              : "px-3 py-2 rounded-lg bg-white border text-slate-800 text-sm"
          }
        >
          Invitaciones
        </button>

        <button
          type="button"
          onClick={() => setMode("recovery")}
          className={
            mode === "recovery"
              ? "px-3 py-2 rounded-lg bg-slate-900 text-white text-sm"
              : "px-3 py-2 rounded-lg bg-white border text-slate-800 text-sm"
          }
        >
          Reset password (manual)
        </button>
      </div>

      {mode === "invite" ? (
        <form onSubmit={handleSubmitInvite} className="bg-white border rounded-xl p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-1">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t?.("inviteAdmin.form.role") || "Rol"}
              </label>
              <select
                className="w-full border rounded px-3 py-2 text-sm"
                value={role}
                onChange={(e) => setRole(e.target.value === "admin" ? "admin" : "owner")}
              >
                <option value="owner">owner (nueva org)</option>
                <option value="admin">admin (en org actual)</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t?.("inviteAdmin.form.selectPerson") || "Seleccionar persona (opcional)"}
              </label>
              <select
                className="w-full border rounded px-3 py-2 text-sm"
                value={selectedOrgPeopleId}
                onChange={handleSelectPerson}
                disabled={!currentOrg?.id}
              >
                <option value="">
                  {currentOrg?.id
                    ? t?.("inviteAdmin.form.selectPlaceholder") || "â€” Elegir de la organizaciÃ³n â€”"
                    : t?.("inviteAdmin.form.noOrg") || "â€” No hay org activa â€”"}
                </option>
                {peopleList.map((p) => (
                  <option key={p.org_people_id} value={p.org_people_id}>
                    {`${p.nombre || ""} ${p.apellido || ""}`} â€” {p.email}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {t?.("inviteAdmin.form.email") || "Email"}
            </label>
            <input
              type="email"
              className="w-full border rounded px-3 py-2 text-sm"
              placeholder={emailPh}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              inputMode="email"
            />
            {role === "admin" && !canInviteAdmin ? (
              <div className="text-xs text-red-600 mt-2">
                {t?.("inviteAdmin.errors.noOrg") || "Para invitar ADMIN debe existir org activa."}
              </div>
            ) : null}
          </div>

          {role === "owner" ? (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t?.("inviteAdmin.form.orgName") || "Nombre de la nueva organizaciÃ³n (opcional)"}
              </label>
              <input
                type="text"
                className="w-full border rounded px-3 py-2 text-sm"
                placeholder="Mi nueva organizaciÃ³n"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                autoComplete="organization"
              />
              <div className="text-[11px] text-slate-500 mt-2">
                {t?.("inviteAdmin.form.orgNameHelp") || "Si lo dejas vacÃ­o, se usa el email por defecto."}
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-600 bg-slate-50 border rounded p-3">
              <span className="font-semibold">Org destino:</span>{" "}
              {currentOrg?.name || currentOrg?.org_name || currentOrg?.id || "â€”"}
            </div>
          )}

          <button
            disabled={sending || (role === "admin" && !canInviteAdmin)}
            className="w-full bg-emerald-600 text-white rounded px-4 py-2 text-sm disabled:opacity-60"
          >
            {sending
              ? t?.("inviteAdmin.form.buttonSending") || "Generando link..."
              : t?.("inviteAdmin.form.buttonSend") || `Generar Magic Link (${roleLabel})`}
          </button>

          {message && <div className={`text-sm ${msgClass}`}>{message.text}</div>}

          {actionLink ? (
            <div className="text-xs break-all bg-slate-50 border rounded p-3">
              <div className="font-semibold mb-2">Magic Link ({roleLabel})</div>

              <div className="flex flex-wrap gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => handleCopy(actionLink)}
                  className="bg-blue-600 text-white rounded px-3 py-2 text-xs"
                >
                  {t?.("inviteAdmin.actions.copy") || "Copiar link"}
                </button>

                <button
                  type="button"
                  onClick={() => window.open(actionLink, "_blank", "noopener,noreferrer")}
                  className="bg-slate-700 text-white rounded px-3 py-2 text-xs"
                >
                  {t?.("inviteAdmin.actions.test") || "Probar link"}
                </button>
              </div>

              <div className="bg-white border rounded p-2 select-all">{actionLink}</div>
              <div className="text-[11px] text-slate-500 mt-2">
                {t?.("inviteAdmin.hints.bestPractice") ||
                  "Tip: si el copiado automÃ¡tico falla, selecciona el link y copia manualmente (Ctrl+C)."}
              </div>
            </div>
          ) : null}
        </form>
      ) : (
        <form onSubmit={handleGenerateRecovery} className="bg-white border rounded-xl p-5 space-y-4">
          <div className="text-sm text-slate-700">
            <div className="font-semibold mb-1">Reset password (fallback universal)</div>
            <div className="text-slate-600 text-xs">
              Genera un <span className="font-semibold">Recovery Link</span> sin depender del correo. Copia y envÃ­a por tu canal.
              El usuario abrirÃ¡ el link, pasarÃ¡ por <span className="font-mono">/auth/callback</span> y luego llegarÃ¡ a{" "}
              <span className="font-mono">/reset-password</span>.
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Email del usuario</label>
            <input
              type="email"
              className="w-full border rounded px-3 py-2 text-sm"
              placeholder={emailPh}
              value={recoveryEmail}
              onChange={(e) => setRecoveryEmail(e.target.value)}
              autoComplete="email"
              inputMode="email"
            />
          </div>

          <button
            disabled={recoveryBusy || !isAppRoot}
            className="w-full bg-slate-900 text-white rounded px-4 py-2 text-sm disabled:opacity-60"
          >
            {recoveryBusy ? "Generando link..." : "Generar Recovery Link"}
          </button>

          {!isAppRoot ? (
            <div className="text-xs text-red-600">Solo App Root puede usar esta herramienta.</div>
          ) : null}

          {recoveryMsg ? <div className={`text-sm ${recoveryClass}`}>{recoveryMsg.text}</div> : null}

          {recoveryLink ? (
            <div className="text-xs break-all bg-slate-50 border rounded p-3">
              <div className="font-semibold mb-2">Recovery Link</div>

              <div className="flex flex-wrap gap-2 mb-2">
                <button
                  type="button"
                  onClick={async () => {
                    const r = await copyToClipboard(recoveryLink);
                    setRecoveryMsg(
                      r.ok
                        ? { type: "success", text: "âœ… Copiado al portapapeles." }
                        : { type: "warn", text: "âš ï¸ Copia manualmente (Ctrl+C)." }
                    );
                  }}
                  className="bg-blue-600 text-white rounded px-3 py-2 text-xs"
                >
                  Copiar link
                </button>

                <button
                  type="button"
                  onClick={() => window.open(recoveryLink, "_blank", "noopener,noreferrer")}
                  className="bg-slate-700 text-white rounded px-3 py-2 text-xs"
                >
                  Probar link
                </button>
              </div>

              <div className="bg-white border rounded p-2 select-all">{recoveryLink}</div>
              <div className="text-[11px] text-slate-500 mt-2">
                Tip: si el usuario no puede abrir el link, que pruebe en incÃ³gnito o en otro navegador.
              </div>
            </div>
          ) : null}
        </form>
      )}
    </div>
  );
}

