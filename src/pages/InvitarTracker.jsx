// src/pages/InvitarTracker.jsx
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabaseClient";

function isUuid(v) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    String(v || "").trim()
  );
}

function resolveOrgId(currentOrg) {
  const raw =
    typeof currentOrg === "string"
      ? currentOrg
      : currentOrg?.id || currentOrg?.org_id || currentOrg?.orgId || null;

  const s = String(raw || "").trim();
  return isUuid(s) ? s : "";
}

function useClickOutside(ref, onOutside) {
  useEffect(() => {
    function onDown(e) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target)) onOutside?.();
    }
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("touchstart", onDown, true);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("touchstart", onDown, true);
    };
  }, [ref, onOutside]);
}

function Dropdown({ items, value, onChange, placeholder = "—" }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const boxRef = useRef(null);

  useClickOutside(boxRef, () => setOpen(false));

  const selected = useMemo(
    () => items.find((x) => String(x.id) === String(value)) || null,
    [items, value]
  );

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((x) =>
      `${x.full_name || ""} ${x.email || ""}`.toLowerCase().includes(s)
    );
  }, [items, q]);

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        className="w-full border rounded-lg px-3 py-2 bg-white text-left"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="truncate">
            {selected ? (
              <>
                <span className="font-medium">{selected.full_name}</span>
                <span className="text-gray-600">
                  {" "}
                  — {selected.email || "(sin email)"}
                </span>
              </>
            ) : (
              <span className="text-gray-500">{placeholder}</span>
            )}
          </div>
          <div className="text-gray-500">{open ? "▴" : "▾"}</div>
        </div>
      </button>

      {open && (
        <div className="absolute z-50 mt-2 w-full bg-white border rounded-xl shadow-lg overflow-hidden">
          <div className="p-2 border-b">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar…"
              className="w-full border rounded-lg px-3 py-2 bg-white"
              autoFocus
            />
          </div>

          <div className="max-h-72 overflow-auto">
            {filtered.length === 0 ? (
              <div className="p-3 text-sm text-gray-500">Sin resultados</div>
            ) : (
              filtered.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="w-full text-left px-3 py-2 hover:bg-gray-50"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange(String(p.id));
                    setOpen(false);
                    setQ("");
                  }}
                >
                  <div className="text-sm font-medium">{p.full_name}</div>
                  <div className="text-xs text-gray-600">
                    {p.email || "(sin email)"}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function planLabel(planCode) {
  const s = String(planCode || "").trim();
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

async function fetchPlanUsage(orgId) {
  if (!orgId) return null;
  const { data, error } = await supabase.rpc("rpc_plan_tracker_vigente_usage", {
    org_id: orgId,
  });
  if (error) return null;
  if (data && typeof data === "object" && "over_limit" in data) return data;
  return null;
}

export default function InvitarTracker() {
  const { t } = useTranslation();
  const { currentOrg } = useAuth();

  const orgId = resolveOrgId(currentOrg);
  const orgName = currentOrg?.name || currentOrg?.nombre || "";

  const [personalRaw, setPersonalRaw] = useState([]);
  const [loadingPersonal, setLoadingPersonal] = useState(false);
  const [personalError, setPersonalError] = useState(null);

  const [selectedPersonId, setSelectedPersonId] = useState("");
  const [email, setEmail] = useState("");

  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  const [success, setSuccess] = useState(null);
  const [inviteData, setInviteData] = useState(null);

  const [planUsage, setPlanUsage] = useState(null);

  // Flags de flujo
  const [forceSwap, setForceSwap] = useState(true);
  const [sendToTrackerGps, setSendToTrackerGps] = useState(true);

  const personal = useMemo(() => {
    if (!orgId) return [];
    return personalRaw.filter((p) => String(p.org_id || "") === orgId);
  }, [personalRaw, orgId]);

  const selectedPerson = useMemo(() => {
    if (!selectedPersonId) return null;
    return personalRaw.find((p) => String(p.id) === String(selectedPersonId)) || null;
  }, [personalRaw, selectedPersonId]);

  function normalizeRows(data) {
    const rows = Array.isArray(data?.items)
      ? data.items
      : Array.isArray(data?.data)
      ? data.data
      : Array.isArray(data)
      ? data
      : [];

    return rows
      .map((p) => ({
        id: p.id,
        full_name:
          `${p.nombre ?? ""} ${p.apellido ?? ""}`.trim() ||
          p.full_name ||
          p.name ||
          "(Sin nombre)",
        email: String(p.email_norm ?? p.email ?? "").trim(),
        org_id: p.org_id ?? null,
      }))
      .filter((p) => p.id);
  }

  // ✅ UNIVERSAL: token desde Supabase (no localStorage)
  const getAuthHeadersOrThrow = useCallback(async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw new Error(error.message || "No se pudo obtener sesión.");
    const token = data?.session?.access_token;
    if (!token) {
      throw new Error(
        t("auth.notAuthenticated", {
          defaultValue: "No autenticado. Cierra sesión y vuelve a entrar.",
        })
      );
    }
    return { Authorization: `Bearer ${token}` };
  }, [t]);

  const loadPersonal = useCallback(async () => {
    setLoadingPersonal(true);
    setPersonalError(null);

    try {
      if (!orgId) {
        setPersonalRaw([]);
        setPersonalError(
          t("org.invalid", {
            defaultValue:
              "Org actual no válida (no se pudo resolver UUID desde currentOrg). Refresca contexto o vuelve a iniciar sesión.",
          })
        );
        return;
      }

      const url = `/api/personal?onlyActive=1&limit=500&org_id=${encodeURIComponent(orgId)}`;
      const headers = await getAuthHeadersOrThrow();
      const res = await fetch(url, { headers });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "No se pudo cargar el personal");

      setPersonalRaw(normalizeRows(data));
    } catch (e) {
      setPersonalError(e?.message || "Error cargando personal");
      setPersonalRaw([]);
    } finally {
      setLoadingPersonal(false);
    }
  }, [orgId, getAuthHeadersOrThrow, t]);

  const refreshPlanUsage = useCallback(async () => {
    setPlanUsage(null);
    if (!orgId) return;

    try {
      const usage = await fetchPlanUsage(orgId);
      if (usage) setPlanUsage(usage);
    } catch {
      setPlanUsage(null);
    }
  }, [orgId]);

  useEffect(() => {
    loadPersonal();
    refreshPlanUsage();
  }, [orgId, loadPersonal, refreshPlanUsage]);

  useEffect(() => {
    setError(null);
    setSuccess(null);
    setInviteData(null);

    if (selectedPerson?.email) setEmail(selectedPerson.email);
    else if (selectedPersonId) setEmail("");
  }, [selectedPersonId, selectedPerson]);

  const overLimit = planUsage?.over_limit === true;

  function buildRedirectPath() {
    // Destino final
    return sendToTrackerGps ? "/tracker-gps?tg_flow=tracker" : "/tracker?tg_flow=tracker";
  }

  async function sendInvite({ mode }) {
    setError(null);
    setSuccess(null);
    setInviteData(null);

    if (!orgId) throw new Error(t("org.invalidShort", { defaultValue: "Organización no válida." }));
    if (!selectedPersonId)
      throw new Error(t("invite.selectPerson", { defaultValue: "Selecciona una persona." }));
    if (!email || !email.includes("@"))
      throw new Error(t("invite.invalidEmail", { defaultValue: "Email inválido." }));

    const emailNorm = email.trim().toLowerCase();
    const redirect_to = buildRedirectPath();

    const headers = await getAuthHeadersOrThrow();

    const res = await fetch("/api/invite-tracker", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify({
        email: emailNorm,
        org_id: orgId,
        person_id: selectedPersonId,

        role: "tracker",
        tg_flow: "tracker",
        redirect_to,
        invited_email: emailNorm,

        force_swap: !!forceSwap,

        // compat legacy
        force_tracker_default: true,

        mode, // "invite" | "resend"
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Error al enviar invitación");
    return data;
  }

  async function handleInviteNew(e) {
    e.preventDefault();
    try {
      setSending(true);

      const usage = planUsage || (await fetchPlanUsage(orgId));
      if (usage?.over_limit === true) {
        const pLabel = planLabel(usage?.plan) || "Starter";
        const limit = usage?.tracker_limit_vigente;
        if (Number.isFinite(Number(limit))) {
          throw new Error(
            t("invite.planLimitReached", {
              defaultValue: `Has alcanzado el límite de tu plan ${pLabel} (${Number(
                limit
              )} tracker vigente).`,
            })
          );
        }
        throw new Error(
          t("invite.planLimitReached2", {
            defaultValue: `Has alcanzado el límite de trackers vigentes de tu plan ${pLabel}.`,
          })
        );
      }

      const data = await sendInvite({ mode: "invite" });
      setInviteData(data);
      setSuccess(
        data?.reused_invite
          ? t("invite.resentReused", {
              defaultValue:
                "Invitación reenviada ✅ (reutilizando un link vigente). Revisa bandeja/spam.",
            })
          : t("invite.sent", { defaultValue: "Invitación enviada ✅ Revisa bandeja/spam." })
      );

      refreshPlanUsage();
    } catch (err) {
      setError(err?.message || "Error inesperado");
    } finally {
      setSending(false);
    }
  }

  async function handleResend(e) {
    e.preventDefault();
    try {
      setSending(true);

      const data = await sendInvite({ mode: "resend" });
      setInviteData(data);
      setSuccess(
        data?.reused_invite
          ? t("invite.resendOkReused", {
              defaultValue: "Reenvío exitoso ✅ (link vigente). Revisa bandeja/spam.",
            })
          : t("invite.resendOkNew", {
              defaultValue: "Reenvío exitoso ✅ (nuevo link). Revisa bandeja/spam.",
            })
      );
    } catch (err) {
      setError(err?.message || "Error inesperado");
    } finally {
      setSending(false);
    }
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(String(text || ""));
    } catch {
      const ta = document.createElement("textarea");
      ta.value = String(text || "");
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
  }

  const inviteLink =
    inviteData?.invite_link || inviteData?.link || inviteData?.url || inviteData?.magic_link || "";

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-6">
        {t("invite.title", { defaultValue: "Invitar / Reenviar Tracker" })}
      </h1>

      {!orgId && (
        <div className="mb-4 p-3 rounded-lg border border-red-300 bg-red-50 text-red-800 text-sm">
          ⚠️{" "}
          {t("org.invalidUuid", {
            defaultValue: "No se pudo resolver la organización activa como UUID.",
          })}
          <div className="mt-1 text-xs">
            currentOrg:{" "}
            <span className="font-mono">{JSON.stringify(currentOrg || {})}</span>
          </div>
        </div>
      )}

      {planUsage && (
        <div
          className={`mb-4 p-3 rounded-lg border text-sm ${
            planUsage?.over_limit
              ? "border-amber-300 bg-amber-50 text-amber-900"
              : "border-emerald-200 bg-emerald-50 text-emerald-900"
          }`}
        >
          <div className="font-medium">
            {t("plan.label", { defaultValue: "Plan" })} {planLabel(planUsage?.plan) || "—"}
          </div>
          <div className="text-xs mt-1">
            {t("plan.trackersVigentes", { defaultValue: "Trackers vigentes" })}:{" "}
            <b>{Number(planUsage?.trackers_vigentes_used ?? 0)}</b> /{" "}
            <b>{Number(planUsage?.tracker_limit_vigente ?? 0)}</b>
            {overLimit ? (
              <span className="ml-2 font-medium">
                — {t("plan.limitReached", { defaultValue: "Límite alcanzado" })}
              </span>
            ) : null}
          </div>

          {overLimit ? (
            <div className="text-xs mt-1">
              {t("plan.limitHint", {
                defaultValue:
                  "Puedes reenviar invitaciones (no agrega trackers), pero no invitar nuevos trackers mientras estés en límite.",
              })}
            </div>
          ) : null}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border p-5 mb-6">
        <div className="flex justify-between items-center mb-3">
          <div className="text-sm font-medium">
            {t("invite.personalActive", { defaultValue: "Personal activo" })} ({personal.length})
          </div>
          <button
            onClick={async () => {
              await loadPersonal();
              await refreshPlanUsage();
            }}
            disabled={loadingPersonal}
            className="px-3 py-2 border rounded-lg text-sm"
            type="button"
          >
            {loadingPersonal
              ? t("common.loading", { defaultValue: "Cargando..." })
              : t("common.refresh", { defaultValue: "Refrescar" })}
          </button>
        </div>

        {personalError && <div className="text-red-600 text-sm">{personalError}</div>}

        <div className="mt-2">
          <Dropdown
            items={personal}
            value={selectedPersonId}
            onChange={setSelectedPersonId}
            placeholder={t("invite.selectPersonPlaceholder", {
              defaultValue: "— Selecciona una persona —",
            })}
          />
        </div>

        <div className="mt-4">
          <label className="text-sm font-medium">
            {t("invite.emailLabel", { defaultValue: "Email del tracker" })}
          </label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 mt-1 bg-white"
          />
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={forceSwap}
              onChange={(e) => setForceSwap(e.target.checked)}
            />
            <span>
              <b>{t("invite.forceSwap", { defaultValue: "Force swap" })}</b>{" "}
              {t("invite.forceSwapHelp", {
                defaultValue: "(evita que un admin consuma el invite)",
              })}
            </span>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={sendToTrackerGps}
              onChange={(e) => setSendToTrackerGps(e.target.checked)}
            />
            <span>
              {t("invite.redirectTo", { defaultValue: "Redirigir a" })}{" "}
              <b>{t("invite.trackerGps", { defaultValue: "Tracker GPS" })}</b> (tg_flow=tracker)
            </span>
          </label>
        </div>

        {error && <div className="text-red-600 text-sm mt-3">{error}</div>}
        {success && <div className="text-green-700 text-sm mt-3">{success}</div>}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-5">
          <button
            onClick={handleInviteNew}
            disabled={sending || !orgId || overLimit}
            className="w-full bg-emerald-600 text-white rounded-lg py-3 disabled:opacity-60"
            title={overLimit ? "Límite de plan alcanzado" : ""}
            type="button"
          >
            {sending
              ? t("common.sending", { defaultValue: "Enviando..." })
              : t("invite.inviteNew", { defaultValue: "Invitar NUEVO tracker" })}
          </button>

          <button
            onClick={handleResend}
            disabled={sending || !orgId}
            className="w-full bg-sky-600 text-white rounded-lg py-3 disabled:opacity-60"
            type="button"
          >
            {sending
              ? t("common.sending", { defaultValue: "Enviando..." })
              : t("invite.resend", { defaultValue: "Reenviar invitación (mismo tracker)" })}
          </button>
        </div>

        {!!inviteData?.email_sent && (
          <div className="mt-6 border rounded-xl p-4 bg-emerald-50 border-emerald-200">
            <div className="text-sm font-medium text-emerald-800 mb-1">
              {t("invite.emailSent", { defaultValue: "Email enviado ✅" })}
            </div>

            <div className="text-xs text-emerald-900">
              {t("invite.emailHint1", {
                defaultValue: "El tracker recibirá un link que lo lleva directo a",
              })}{" "}
              <b>{sendToTrackerGps ? "Tracker GPS" : "Tracker Dashboard"}</b>.
              <br />
              {t("invite.emailHint2", {
                defaultValue: "Si no lo ve, revisar Spam.",
              })}
              {inviteData?.reused_invite ? (
                <div className="mt-1">
                  <b>{t("common.note", { defaultValue: "Nota" })}:</b>{" "}
                  {t("invite.reusedInviteNote", {
                    defaultValue:
                      "Se reutilizó un invite vigente (no se creó una fila nueva).",
                  })}
                </div>
              ) : null}
            </div>

            {!!inviteLink && (
              <div className="mt-3">
                <div className="text-xs font-medium text-emerald-900 mb-1">
                  {t("invite.linkDebug", { defaultValue: "Link (debug/soporte):" })}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={inviteLink}
                    className="w-full border rounded-lg px-3 py-2 bg-white text-xs font-mono"
                  />
                  <button
                    type="button"
                    className="px-3 py-2 border rounded-lg text-xs bg-white"
                    onClick={() => copy(inviteLink)}
                  >
                    {t("common.copy", { defaultValue: "Copiar" })}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="text-xs text-gray-500">
        Org actual:{" "}
        <span className="font-mono">
          {orgName ? `${orgName} — ` : ""}
          {orgId || "(vacío / inválido)"}
        </span>
      </div>
    </div>
  );
}
