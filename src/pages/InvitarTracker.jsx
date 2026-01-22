import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";

export default function InvitarTracker() {
  const { currentOrg } = useAuth();

  const [personal, setPersonal] = useState([]);
  const [loadingPersonal, setLoadingPersonal] = useState(false);
  const [personalError, setPersonalError] = useState(null);

  const [selectedPersonId, setSelectedPersonId] = useState("");
  const [email, setEmail] = useState("");

  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const activeCount = personal?.length || 0;

  const selectedPerson = useMemo(() => {
    if (!selectedPersonId) return null;
    return personal.find((p) => String(p.id) === String(selectedPersonId)) || null;
  }, [personal, selectedPersonId]);

  async function loadPersonal() {
    setLoadingPersonal(true);
    setPersonalError(null);

    try {
      const res = await fetch("/api/personal?onlyActive=1&limit=500", {
        method: "GET",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || data?.message || "No se pudo cargar el personal activo");
      }

      // Soportar varios formatos comunes:
      const rows = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : Array.isArray(data?.rows) ? data.rows : [];

      // Normaliza campos esperados: id, full_name/name, email
      const normalized = rows
        .map((p) => ({
          id: p.id ?? p.person_id ?? p.uuid,
          full_name: p.full_name ?? p.name ?? p.nombre ?? p.apellidos ? `${p.nombre ?? ""} ${p.apellidos ?? ""}`.trim() : "",
          email: p.email ?? p.mail ?? "",
          active: p.active ?? p.is_active ?? true,
        }))
        .filter((p) => p.id);

      setPersonal(normalized);
    } catch (e) {
      setPersonalError(e?.message || "Error cargando personal");
      setPersonal([]);
    } finally {
      setLoadingPersonal(false);
    }
  }

  useEffect(() => {
    loadPersonal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Autocompletar email cuando se selecciona persona
    if (selectedPerson?.email) {
      setEmail(String(selectedPerson.email).trim());
    } else if (selectedPersonId) {
      // Si la persona no tiene email, deja el campo vacío para que lo escriban
      setEmail("");
    }
  }, [selectedPersonId, selectedPerson]);

  async function handleInvite(e) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!currentOrg?.id) {
      setError("Organización no válida. Reingresa al panel.");
      return;
    }

    if (!selectedPersonId) {
      setError("Selecciona una persona del personal activo.");
      return;
    }

    const cleanEmail = String(email || "").trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setError("Email inválido.");
      return;
    }

    try {
      setSending(true);

      const res = await fetch("/api/invite-tracker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: cleanEmail,
          org_id: currentOrg.id,
          person_id: selectedPersonId,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        // Si tu proxy v2 está activo, el error real vendrá en data.upstream
        const upstreamMsg =
          data?.upstream?.message ||
          data?.upstream?.error ||
          data?.upstream?.details ||
          null;

        throw new Error(upstreamMsg || data?.error || data?.message || "Error al enviar invitación");
      }

      setSuccess("Invitación enviada. Revisa el correo del tracker (o el magic link si aplica).");
    } catch (err) {
      setError(err?.message || "Error inesperado");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-6">Invitar Tracker</h1>

      <div className="bg-white rounded-xl shadow-sm border p-5 mb-6">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <div className="text-sm font-medium">Seleccionar persona (Personal activo)</div>
            <div className="text-xs text-gray-500">Activos: {loadingPersonal ? "..." : activeCount}</div>
          </div>

          <button
            type="button"
            onClick={loadPersonal}
            disabled={loadingPersonal}
            className="px-3 py-2 rounded-lg border text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            {loadingPersonal ? "Cargando..." : "Refrescar"}
          </button>
        </div>

        {personalError && (
          <div className="text-red-600 text-sm mb-3">
            {personalError}
          </div>
        )}

        <select
          value={selectedPersonId}
          onChange={(e) => setSelectedPersonId(e.target.value)}
          className="w-full border rounded-lg px-3 py-2"
        >
          <option value="">— Selecciona una persona —</option>
          {personal.map((p) => {
            const label = `${p.full_name || "(Sin nombre)"} — ${p.email || "(sin email)"}`;
            return (
              <option key={p.id} value={p.id}>
                {label}
              </option>
            );
          })}
        </select>

        <div className="mt-4">
          <label className="block text-sm font-medium mb-1">Email del tracker</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border rounded-lg px-3 py-2"
            placeholder="tracker@email.com"
          />
          <div className="text-xs text-gray-500 mt-1">
            Se autocompleta desde la persona seleccionada. Puedes editarlo si hace falta.
          </div>
        </div>

        <form onSubmit={handleInvite} className="mt-5">
          {error && <div className="text-red-600 text-sm mb-3">{error}</div>}
          {success && <div className="text-green-600 text-sm mb-3">{success}</div>}

          <button
            type="submit"
            disabled={sending || loadingPersonal}
            className="w-full bg-emerald-600 text-white rounded-lg py-3 font-medium hover:bg-emerald-700 disabled:opacity-50"
          >
            {sending ? "Enviando..." : "Enviar invitación"}
          </button>
        </form>
      </div>

      <div className="text-xs text-gray-500">
        Org actual: <span className="font-mono">{currentOrg?.id || "(sin org)"}</span>
      </div>
    </div>
  );
}
