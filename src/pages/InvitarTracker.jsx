import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";

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

  // NUEVO: magic link
  const [magicLink, setMagicLink] = useState(null);

  const orgId = currentOrg?.id ? String(currentOrg.id) : "";

  const personal = useMemo(() => {
    if (!orgId) return [];
    return personalRaw.filter((p) => String(p.org_id || "") === orgId);
  }, [personalRaw, orgId]);

  const foreignCount = useMemo(() => {
    if (!orgId) return 0;
    return personalRaw.filter((p) => p.org_id && String(p.org_id) !== orgId).length;
  }, [personalRaw, orgId]);

  const selectedPerson = useMemo(() => {
    if (!selectedPersonId) return null;
    return personalRaw.find((p) => String(p.id) === String(selectedPersonId)) || null;
  }, [personalRaw, selectedPersonId]);

  async function loadPersonal() {
    setLoadingPersonal(true);
    setPersonalError(null);

    try {
      const url = orgId
        ? `/api/personal?onlyActive=1&limit=500&org_id=${encodeURIComponent(orgId)}`
        : `/api/personal?onlyActive=1&limit=500`;

      const res = await fetch(url, { credentials: "include" });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) throw new Error(data?.error || "No se pudo cargar el personal");

      const rows = Array.isArray(data?.items)
        ? data.items
        : Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data)
        ? data
        : [];

      const normalized = rows
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

      setPersonalRaw(normalized);
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
    setMagicLink(null);

    if (selectedPerson?.email) setEmail(selectedPerson.email);
    else if (selectedPersonId) setEmail("");
  }, [selectedPersonId, selectedPerson]);

  async function handleInvite(e) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setMagicLink(null);

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

      // 👇 NUEVO: detectar magic link
      const delivery = data?.data?.delivery;
      const actionLink = data?.data?.action_link;

      if (delivery === "magic_link" && actionLink) {
        setMagicLink(actionLink);
        setSuccess("Invitación creada. No se envió correo. Comparte el enlace con el tracker.");
      } else {
        setSuccess("Invitación enviada. Revisa el correo del tracker.");
      }
    } catch (err) {
      setError(err.message || "Error inesperado");
    } finally {
      setSending(false);
    }
  }

  function copyLink() {
    if (!magicLink) return;
    navigator.clipboard.writeText(magicLink);
    alert("Enlace copiado");
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-6">Invitar Tracker</h1>

      <div className="bg-white rounded-xl shadow-sm border p-5 mb-6">
        <div className="flex justify-between items-center mb-3">
          <div className="text-sm font-medium">
            Personal activo ({personal.length})
          </div>
          <button
            onClick={loadPersonal}
            disabled={loadingPersonal}
            className="px-3 py-2 border rounded-lg text-sm"
          >
            {loadingPersonal ? "Cargando..." : "Refrescar"}
          </button>
        </div>

        {personalError && <div className="text-red-600 text-sm">{personalError}</div>}

        <select
          value={selectedPersonId}
          onChange={(e) => setSelectedPersonId(e.target.value)}
          className="w-full border rounded-lg px-3 py-2 mt-2"
        >
          <option value="">— Selecciona una persona —</option>
          {personal.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name} — {p.email || "(sin email)"}
            </option>
          ))}
        </select>

        <div className="mt-4">
          <label className="text-sm font-medium">Email del tracker</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 mt-1"
          />
        </div>

        <form onSubmit={handleInvite} className="mt-5">
          {error && <div className="text-red-600 text-sm mb-2">{error}</div>}
          {success && <div className="text-green-600 text-sm mb-2">{success}</div>}

          {magicLink && (
            <div className="mt-3 p-3 border rounded-lg bg-gray-50">
              <div className="text-sm font-medium mb-2">
                Enlace de acceso para el tracker
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={copyLink}
                  className="px-3 py-2 bg-gray-200 rounded-lg text-sm"
                >
                  Copiar enlace
                </button>
                <a
                  href={magicLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm"
                >
                  Abrir enlace
                </a>
              </div>
            </div>
          )}

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
        Org actual: <span className="font-mono">{orgId}</span>
      </div>
    </div>
  );
}
