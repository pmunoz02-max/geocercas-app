import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";

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

export default function InvitarTracker() {
  const { currentOrg } = useAuth();

  const [personalRaw, setPersonalRaw] = useState([]);
  const [loadingPersonal, setLoadingPersonal] = useState(false);
  const [personalError, setPersonalError] = useState(null);
  const [personalDebug, setPersonalDebug] = useState(null);

  const [selectedPersonId, setSelectedPersonId] = useState("");
  const [email, setEmail] = useState("");

  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const orgId = currentOrg?.id ? String(currentOrg.id) : "";

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
        email: (p.email_norm ?? p.email ?? "").trim(),
        org_id: p.org_id ?? null,
      }))
      .filter((p) => p.id);
  }

  async function fetchPersonal(url, label) {
    const res = await fetch(url, { credentials: "include" });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data, label, url };
  }

  async function loadPersonal() {
    setLoadingPersonal(true);
    setPersonalError(null);
    setPersonalDebug(null);

    try {
      if (!orgId) {
        setPersonalRaw([]);
        setPersonalError("Org actual no definida.");
        return;
      }

      // A) org_id + onlyActive
      const aUrl = `/api/personal?onlyActive=1&limit=500&org_id=${encodeURIComponent(orgId)}`;
      const A = await fetchPersonal(aUrl, "A org_id+onlyActive");

      if (!A.ok) throw new Error(A.data?.error || "No se pudo cargar el personal (A)");

      let rows = normalizeRows(A.data);

      // Fallback B) sin org_id (si backend ignora org_id o usa org server-side distinto)
      if (rows.length === 0) {
        const bUrl = `/api/personal?onlyActive=1&limit=500`;
        const B = await fetchPersonal(bUrl, "B onlyActive (sin org_id)");
        if (B.ok) rows = normalizeRows(B.data);
        setPersonalDebug({ tried: ["A", "B"], A: A.data, B: B.data });
      }

      // Fallback C) org_id sin onlyActive (si filtro activo está mal)
      if (rows.length === 0) {
        const cUrl = `/api/personal?limit=500&org_id=${encodeURIComponent(orgId)}`;
        const C = await fetchPersonal(cUrl, "C org_id (sin onlyActive)");
        if (C.ok) rows = normalizeRows(C.data);
        setPersonalDebug((d) => ({ ...(d || {}), tried: [...(d?.tried || ["A","B"]), "C"], C: C.data }));
      }

      setPersonalRaw(rows);
    } catch (e) {
      setPersonalError(e.message || "Error cargando personal");
      setPersonalRaw([]);
    } finally {
      setLoadingPersonal(false);
    }
  }

  useEffect(() => {
    loadPersonal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  useEffect(() => {
    setError(null);
    setSuccess(null);

    if (selectedPerson?.email) setEmail(selectedPerson.email);
    else if (selectedPersonId) setEmail("");
  }, [selectedPersonId, selectedPerson]);

  async function handleInvite(e) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!orgId) return setError("Organización no válida.");
    if (!selectedPersonId) return setError("Selecciona una persona.");
    if (!email || !email.includes("@")) return setError("Email inválido.");

    try {
      setSending(true);

      const res = await fetch("/api/invite-tracker", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          org_id: orgId,
          person_id: selectedPersonId,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Error al enviar invitación");

      setSuccess("Invitación enviada. Revisa el correo del tracker.");
    } catch (err) {
      setError(err.message || "Error inesperado");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-6">Invitar Tracker</h1>

      <div className="bg-white rounded-xl shadow-sm border p-5 mb-6">
        <div className="flex justify-between items-center mb-3">
          <div className="text-sm font-medium">Personal activo ({personal.length})</div>
          <button
            onClick={loadPersonal}
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

        {personal.length === 0 && personalDebug && (
          <div className="mt-3 text-xs text-amber-700">
            Debug: API devolvió 0 items. Fallbacks usados: {String(personalDebug?.tried || [])}
          </div>
        )}

        <div className="mt-4">
          <label className="text-sm font-medium">Email del tracker</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 mt-1 bg-white"
          />
        </div>

        <form onSubmit={handleInvite} className="mt-5">
          {error && <div className="text-red-600 text-sm mb-2">{error}</div>}
          {success && <div className="text-green-600 text-sm mb-2">{success}</div>}

          <button
            type="submit"
            disabled={sending}
            className="w-full mt-4 bg-emerald-600 text-white rounded-lg py-3"
          >
            {sending ? "Enviando..." : "Enviar invitación"}
          </button>
        </form>
      </div>

      <div className="text-xs text-gray-500">
        Org actual: <span className="font-mono">{orgId || "(vacío)"}</span>
      </div>
    </div>
  );
}
