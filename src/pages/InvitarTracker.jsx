import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabaseClient";

function isUuid(v) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    String(v || "").trim()
  );
}

function getSupabaseAccessTokenFromLocalStorage() {
  try {
    const keys = Object.keys(window.localStorage || {});
    const k = keys.find((x) => /^sb-.*-auth-token$/i.test(String(x)));
    if (!k) return "";
    const raw = window.localStorage.getItem(k);
    if (!raw) return "";
    const j = JSON.parse(raw);
    const token =
      j?.access_token ||
      j?.currentSession?.access_token ||
      j?.data?.session?.access_token ||
      "";
    return String(token || "").trim();
  } catch {
    return "";
  }
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

function Dropdown({ items, value, onChange, placeholder = "— Selecciona —" }) {
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
                  <div className="text-xs text-gray-600">{p.email || "(sin email)"}</div>
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
  const { currentOrg } = useAuth();

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

  const orgId = currentOrg && isUuid(currentOrg.id) ? String(currentOrg.id).trim() : "";
  const orgName = currentOrg?.name || "";

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

  function getAuthHeadersOrThrow() {
    const token = getSupabaseAccessTokenFromLocalStorage();
    if (!token) {
      throw new Error("No autenticado (sin access_token). Cierra sesión y vuelve a entrar.");
    }
    return { Authorization: `Bearer ${token}` };
  }

  async function loadPersonal() {
    setLoadingPersonal(true);
    setPersonalError(null);

    try {
      if (!orgId) {
        setPersonalRaw([]);
        setPersonalError(
          "Org actual no válida (currentOrg.id no es UUID). Refresca contexto o vuelve a iniciar sesión."
        );
        return;
      }

      const url = `/api/personal?onlyActive=1&limit=500&org_id=${encodeURIComponent(orgId)}`;
      const res = await fetch(url, { headers: { ...getAuthHeadersOrThrow() } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "No se pudo cargar el personal");
      setPersonalRaw(normalizeRows(data));
    } catch (e) {
      setPersonalError(e.message || "Error cargando personal");
      setPersonalRaw([]);
    } finally {
      setLoadingPersonal(false);
    }
  }

  async function refreshPlanUsage() {
    setPlanUsage(null);
    if (!orgId) return;

    try {
      const usage = await fetchPlanUsage(orgId);
      if (usage) setPlanUsage(usage);
    } catch {
      setPlanUsage(null);
    }
  }

  useEffect(() => {
    loadPersonal();
    refreshPlanUsage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  useEffect(() => {
    setError(null);
    setSuccess(null);
    setInviteData(null);

    if (selectedPerson?.email) setEmail(selectedPerson.email);
    else if (selectedPersonId) setEmail("");
  }, [selectedPersonId, selectedPerson]);

  const overLimit = planUsage?.over_limit === true;

  async function sendInvite({ mode }) {
    setError(null);
    setSuccess(null);
    setInviteData(null);

    if (!orgId) throw new Error("Organización no válida (currentOrg.id no es UUID).");
    if (!selectedPersonId) throw new Error("Selecciona una persona.");
    if (!email || !email.includes("@")) throw new Error("Email inválido.");

    const res = await fetch("/api/invite-tracker", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeadersOrThrow(),
      },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        org_id: orgId,
        person_id: selectedPersonId,
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

      // Solo bloqueamos "invitar nuevo" por plan.
      const usage = planUsage || (await fetchPlanUsage(orgId));
      if (usage?.over_limit === true) {
        const pLabel = planLabel(usage?.plan) || "Starter";
        const limit = usage?.tracker_limit_vigente;
        if (Number.isFinite(Number(limit))) {
          throw new Error(
            `Has alcanzado el límite de tu plan ${pLabel} (${Number(limit)} tracker vigente).`
          );
        }
        throw new Error(`Has alcanzado el límite de trackers vigentes de tu plan ${pLabel}.`);
      }

      const data = await sendInvite({ mode: "invite" });
      setInviteData(data);
      setSuccess(
        data?.reused_invite
          ? "Invitación reenviada ✅ (reutilizando un link vigente). Revisa bandeja/spam."
          : "Invitación enviada ✅ Revisa bandeja/spam."
      );

      refreshPlanUsage();
    } catch (err) {
      setError(err.message || "Error inesperado");
    } finally {
      setSending(false);
    }
  }

  async function handleResend(e) {
    e.preventDefault();
    try {
      setSending(true);

      // ✅ Reenviar NO se bloquea por plan
      const data = await sendInvite({ mode: "resend" });
      setInviteData(data);
      setSuccess(
        data?.reused_invite
          ? "Reenvío exitoso ✅ (link vigente). Revisa bandeja/spam."
          : "Reenvío exitoso ✅ (nuevo link). Revisa bandeja/spam."
      );
    } catch (err) {
      setError(err.message || "Error inesperado");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-6">Invitar / Reenviar Tracker</h1>

      {!orgId && (
        <div className="mb-4 p-3 rounded-lg border border-red-300 bg-red-50 text-red-800 text-sm">
          ⚠️ La organización actual no tiene un <b>UUID válido</b> en <code>currentOrg.id</code>.
          <div className="mt-1 text-xs">
            Org actual (currentOrg.id):{" "}
            <span className="font-mono">{String(currentOrg?.id || "(vacío)")}</span>
          </div>
        </div>
      )}

      {planUsage && (
        <div
          className={`mb-4 p-3 rounded-lg border text-sm ${
            overLimit
              ? "border-amber-300 bg-amber-50 text-amber-900"
              : "border-emerald-200 bg-emerald-50 text-emerald-900"
          }`}
        >
          <div className="font-medium">Plan {planLabel(planUsage?.plan) || "—"}</div>
          <div className="text-xs mt-1">
            Trackers vigentes: <b>{Number(planUsage?.trackers_vigentes_used ?? 0)}</b> /{" "}
            <b>{Number(planUsage?.tracker_limit_vigente ?? 0)}</b>
            {overLimit ? <span className="ml-2 font-medium">— Límite alcanzado</span> : null}
          </div>
          {overLimit ? (
            <div className="text-xs mt-1">
              Puedes <b>reenviar</b> invitaciones (no agrega trackers), pero <b>no</b> invitar nuevos
              trackers mientras estés en límite.
            </div>
          ) : null}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border p-5 mb-6">
        <div className="flex justify-between items-center mb-3">
          <div className="text-sm font-medium">Personal activo ({personal.length})</div>
          <button
            onClick={async () => {
              await loadPersonal();
              await refreshPlanUsage();
            }}
            disabled={loadingPersonal}
            className="px-3 py-2 border rounded-lg text-sm"
            type="button"
          >
            {loadingPersonal ? "Cargando..." : "Refrescar"}
          </button>
        </div>

        {personalError && <div className="text-red-600 text-sm">{personalError}</div>}

        <div className="mt-2">
          <Dropdown
            items={personal}
            value={selectedPersonId}
            onChange={setSelectedPersonId}
            placeholder="— Selecciona una persona —"
          />
        </div>

        <div className="mt-4">
          <label className="text-sm font-medium">Email del tracker</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 mt-1 bg-white"
          />
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
            {sending ? "Enviando..." : "Invitar NUEVO tracker"}
          </button>

          <button
            onClick={handleResend}
            disabled={sending || !orgId}
            className="w-full bg-sky-600 text-white rounded-lg py-3 disabled:opacity-60"
            type="button"
          >
            {sending ? "Enviando..." : "Reenviar invitación (mismo tracker)"}
          </button>
        </div>

        {!!inviteData?.email_sent && (
          <div className="mt-6 border rounded-xl p-4 bg-emerald-50 border-emerald-200">
            <div className="text-sm font-medium text-emerald-800 mb-1">Email enviado ✅</div>
            <div className="text-xs text-emerald-900">
              El tracker recibirá un link que lo lleva directo a <b>Tracker GPS</b>.
              <br />
              Si no lo ve, revisar <b>Spam</b>.
              {inviteData?.reused_invite ? (
                <div className="mt-1">
                  <b>Nota:</b> Se reutilizó un invite vigente (no se creó una fila nueva).
                </div>
              ) : null}
            </div>
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
