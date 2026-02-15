import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuthSafe } from "../context/AuthContext.jsx";

function normalizeEmail(v) {
  return String(v || "").trim().toLowerCase();
}

// Heurística para mostrar nombre si existe
function pickLabel(row) {
  const email = row?.email || row?.person_email || row?.user_email || "";
  const name =
    row?.full_name ||
    row?.name ||
    row?.display_name ||
    row?.person_name ||
    row?.user_name ||
    "";
  if (name && email) return `${name} — ${email}`;
  return email || name || "(sin datos)";
}

export default function InvitarTracker() {
  const navigate = useNavigate();
  const auth = useAuthSafe();

  const [busy, setBusy] = useState(false);
  const [loadingPeople, setLoadingPeople] = useState(true);

  const [people, setPeople] = useState([]); // rows from view
  const [selectedKey, setSelectedKey] = useState(""); // selected email (normalized)
  const [emailInput, setEmailInput] = useState("");

  const [okMsg, setOkMsg] = useState(null);
  const [errMsg, setErrMsg] = useState(null);

  const orgId = useMemo(() => {
    const id =
      auth?.orgId ||
      auth?.currentOrgId ||
      auth?.org?.id ||
      auth?.org_id ||
      "";
    return String(id || "").trim();
  }, [auth]);

  const who = useMemo(() => {
    return {
      email: auth?.user?.email || "",
      user_id: auth?.user?.id || "",
      org_id: orgId,
    };
  }, [auth, orgId]);

  // Mapa de emails permitidos (solo miembros de org)
  const allowedEmails = useMemo(() => {
    const set = new Set();
    for (const r of people) {
      const e = normalizeEmail(r?.email || r?.person_email || r?.user_email || "");
      if (e) set.add(e);
    }
    return set;
  }, [people]);

  // 1) Cargar people de la org (solo existentes)
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoadingPeople(true);
      setErrMsg(null);

      if (!orgId) {
        setPeople([]);
        setLoadingPeople(false);
        setErrMsg("No hay organización activa. Ve a /inicio y selecciona tu organización.");
        return;
      }

      try {
        // ✅ Vista que ya existe según tu lista: v_org_people_ui_all
        // Intentamos traer campos comunes; si tu view tiene otros, ajustamos.
        const { data, error } = await supabase
          .from("v_org_people_ui_all")
          .select("*")
          .eq("org_id", orgId)
          .limit(500);

        if (cancelled) return;

        if (error) throw error;

        const rows = Array.isArray(data) ? data : [];
        // Normalizamos sort por email/nombre para un droplist estable
        rows.sort((a, b) => pickLabel(a).localeCompare(pickLabel(b)));
        setPeople(rows);

        // Si el user ya escribió algo, revalidamos
        const current = normalizeEmail(emailInput);
        if (current && !allowedEmails.has(current)) {
          // no borramos, solo advertimos en UI al enviar
        }
      } catch (e) {
        if (cancelled) return;
        setPeople([]);
        setErrMsg(String(e?.message || e));
      } finally {
        if (!cancelled) setLoadingPeople(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  // 2) Cuando seleccionan del droplist, sincroniza email
  useEffect(() => {
    if (!selectedKey) return;
    setEmailInput(selectedKey);
  }, [selectedKey]);

  async function onSendInvite(e) {
    e.preventDefault();
    setOkMsg(null);
    setErrMsg(null);

    const cleanEmail = normalizeEmail(emailInput);

    if (!orgId) {
      setErrMsg("No hay organización activa. Ve a /inicio y selecciona tu organización.");
      return;
    }

    if (!cleanEmail || !cleanEmail.includes("@")) {
      setErrMsg("Selecciona un email válido del droplist.");
      return;
    }

    // ✅ REGLA: solo miembros existentes
    if (!allowedEmails.has(cleanEmail)) {
      setErrMsg("Ese email no está registrado en esta organización. Primero regístralo en Personal.");
      return;
    }

    try {
      setBusy(true);

      const res = await fetch("/api/invite-tracker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: cleanEmail,
          org_id: orgId,
          role: "tracker",
        }),
      });

      const text = await res.text().catch(() => "");
      let body = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = { raw: text };
      }

      if (!res.ok) {
        const msg = body?.error || body?.message || body?.raw || `HTTP ${res.status}`;
        setErrMsg(`Error invitaciones (${res.status}): ${msg}`);
        return;
      }

      // HTTP 200 pero ok=false => upstream error real
      if (body && body.ok === false) {
        const upstreamStatus = body?.upstream_status || "?";
        const upstreamMsg =
          body?.upstream?.error || body?.error || body?.message || "UPSTREAM_ERROR";
        setErrMsg(`Error invitaciones (${upstreamStatus}): ${upstreamMsg}`);
        return;
      }

      const actionLink = body?.action_link || "";
      const emailSent = body?.email_sent;

      let msg = `✅ Invitación generada para ${cleanEmail}.`;
      if (emailSent === true) msg += " Correo enviado.";
      if (emailSent === false && actionLink) msg += " Si no llega, usa el enlace de respaldo.";

      setOkMsg({ msg, actionLink, diag: body?.diag || null });
    } catch (e2) {
      setErrMsg(String(e2?.message || e2));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6">
      <div className="w-full max-w-2xl rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold text-gray-900">Invitar Tracker</h1>
          <button
            type="button"
            onClick={() => navigate("/tracker")}
            className="rounded-xl border px-3 py-2 text-sm hover:bg-slate-50 text-slate-800"
          >
            Volver a Tracker
          </button>
        </div>

        {/* Diagnóstico */}
        <div className="mt-4 rounded-xl border bg-slate-50 p-3 text-xs text-slate-700">
          <div><b>Org usada:</b> {who.org_id || "—"}</div>
          <div><b>Usuario:</b> {who.email || "—"} ({who.user_id || "—"})</div>
          <div className="mt-1">
            <b>Miembros cargados:</b> {loadingPeople ? "cargando…" : String(people.length)}
          </div>
        </div>

        {errMsg && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {errMsg}
          </div>
        )}

        {okMsg && (
          <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700">
            <div>{okMsg.msg}</div>
            {okMsg.actionLink ? (
              <div className="mt-2 text-xs text-slate-700">
                <div className="font-semibold">Magic Link (respaldo):</div>
                <div className="mt-1 break-all rounded-lg border bg-white p-2">
                  {okMsg.actionLink}
                </div>
              </div>
            ) : null}
          </div>
        )}

        <form onSubmit={onSendInvite} className="mt-6 space-y-4">
          {/* Droplist de miembros de org */}
          <div>
            <label className="block text-sm font-medium text-gray-900">
              Selecciona persona (solo miembros de la org)
            </label>

            <select
              className="mt-1 w-full rounded-xl border px-3 py-2 bg-white text-gray-900"
              value={selectedKey}
              onChange={(e) => {
                const v = normalizeEmail(e.target.value);
                setSelectedKey(v);
                setEmailInput(v);
                setOkMsg(null);
                setErrMsg(null);
              }}
              disabled={loadingPeople || people.length === 0}
            >
              <option value="">
                {loadingPeople
                  ? "Cargando miembros…"
                  : people.length === 0
                  ? "No hay miembros en esta org"
                  : "— Selecciona —"}
              </option>

              {people.map((p, idx) => {
                const email =
                  normalizeEmail(p?.email || p?.person_email || p?.user_email || "");
                if (!email) return null;
                return (
                  <option key={`${email}-${idx}`} value={email}>
                    {pickLabel(p)}
                  </option>
                );
              })}
            </select>

            <p className="mt-2 text-xs text-slate-600">
              Solo podrás invitar emails que existan en esta lista. Para agregar más, regístralos en <b>Personal</b>.
            </p>
          </div>

          {/* Campo email (solo lectura efectiva; permite pegar pero valida pertenencia) */}
          <div>
            <label className="block text-sm font-medium text-gray-900">Email del tracker</label>
            <input
              className="mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring bg-white text-gray-900"
              type="email"
              value={emailInput}
              onChange={(e) => {
                setEmailInput(e.target.value);
                setOkMsg(null);
                setErrMsg(null);
              }}
              placeholder="Selecciona desde el droplist"
            />
          </div>

          <button
            type="submit"
            disabled={busy || loadingPeople}
            className="w-full rounded-xl bg-black px-4 py-2 text-white disabled:opacity-60"
          >
            {busy ? "Enviando..." : "Enviar invitación"}
          </button>
        </form>
      </div>
    </div>
  );
}
