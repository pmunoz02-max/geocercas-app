import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";

const LS_LAST_INVITE_KEY = "last_tracker_invite_link_v1";

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

  const [selectedPersonId, setSelectedPersonId] = useState("");
  const [email, setEmail] = useState("");

  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  const [success, setSuccess] = useState(null);
  const [inviteData, setInviteData] = useState(null);
  const [copied, setCopied] = useState(false);

  // ✅ orgId SOLO desde currentOrg.id
  const orgId =
    currentOrg && isUuid(currentOrg.id) ? String(currentOrg.id).trim() : "";
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
        email: (p.email_norm ?? p.email ?? "").trim(),
        org_id: p.org_id ?? null,
      }))
      .filter((p) => p.id);
  }

  function getAuthHeadersOrThrow() {
    const token = getSupabaseAccessTokenFromLocalStorage();
    if (!token)
      throw new Error(
        "No autenticado (sin access_token). Cierra sesión y vuelve a entrar."
      );
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

      const url = `/api/personal?onlyActive=1&limit=500&org_id=${encodeURIComponent(
        orgId
      )}`;
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

  useEffect(() => {
    loadPersonal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  useEffect(() => {
    setError(null);
    setSuccess(null);
    setInviteData(null);
    setCopied(false);

    if (selectedPerson?.email) setEmail(selectedPerson.email);
    else if (selectedPersonId) setEmail("");
  }, [selectedPersonId, selectedPerson]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_LAST_INVITE_KEY);
      if (!raw) return;
      const j = JSON.parse(raw);
      // guardamos tanto si es email_sent o magic_link
      if (j) setInviteData(j);
    } catch {}
  }, []);

  async function copyLink() {
    const link = String(inviteData?.magic_link || "").trim();
    if (!link) return;

    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = link;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  function openWhatsApp() {
    const link = String(inviteData?.magic_link || "").trim();
    if (!link) return;

    const msg =
      `Hola. Este es tu link de acceso como Tracker a App Geocercas:\n\n${link}\n\n` +
      `Al abrirlo, llegarás directo a Tracker GPS.`;
    const wa = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(wa, "_blank", "noopener,noreferrer");
  }

  async function handleInvite(e) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setInviteData(null);
    setCopied(false);

    if (!orgId) return setError("Organización no válida (currentOrg.id no es UUID).");
    if (!selectedPersonId) return setError("Selecciona una persona.");
    if (!email || !email.includes("@")) return setError("Email inválido.");

    try {
      setSending(true);

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
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Error al invitar tracker");

      setInviteData(data);
      try {
        localStorage.setItem(LS_LAST_INVITE_KEY, JSON.stringify(data));
      } catch {}

      // Mensaje UX claro según el caso
      if (data?.email_sent) {
        setSuccess("Email enviado ✅ Revisa bandeja de entrada / spam.");
      } else if (data?.magic_link) {
        setSuccess("Link generado ✅ Envíalo por WhatsApp/Email al tracker.");
      } else {
        setSuccess("Invitación OK ✅");
      }
    } catch (err) {
      setError(err.message || "Error inesperado");
    } finally {
      setSending(false);
    }
  }

  const showMagicLink = !!inviteData?.magic_link && !inviteData?.email_sent;
  const magicLink = String(inviteData?.magic_link || "").trim();

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-6">Invitar Tracker</h1>

      {!orgId && (
        <div className="mb-4 p-3 rounded-lg border border-red-300 bg-red-50 text-red-800 text-sm">
          ⚠️ La organización actual no tiene un <b>UUID válido</b> en{" "}
          <code>currentOrg.id</code>.
          <div className="mt-1 text-xs">
            Org actual (currentOrg.id):{" "}
            <span className="font-mono">{String(currentOrg?.id || "(vacío)")}</span>
          </div>
        </div>
      )}

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
          {success && <div className="text-green-700 text-sm mb-2">{success}</div>}

          <button
            type="submit"
            disabled={sending || !orgId}
            className="w-full mt-4 bg-emerald-600 text-white rounded-lg py-3 disabled:opacity-60"
          >
            {sending ? "Generando..." : "Generar invitación"}
          </button>
        </form>

        {/* ✅ Mostrar Magic Link SOLO si usuario ya existía (fallback) */}
        {showMagicLink && (
          <div className="mt-6 border rounded-xl p-4 bg-emerald-50 border-emerald-200">
            <div className="text-sm font-medium text-emerald-800 mb-2">
              Magic link (Tracker)
            </div>

            <textarea
              readOnly
              value={magicLink}
              className="w-full h-28 border rounded-lg p-3 font-mono text-xs bg-white"
            />

            <div className="flex gap-2 mt-3 flex-wrap">
              <button
                type="button"
                onClick={copyLink}
                className="px-4 py-2 rounded-lg border bg-white text-sm"
              >
                {copied ? "✅ Copiado" : "Copiar link"}
              </button>

              <button
                type="button"
                onClick={openWhatsApp}
                className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm"
              >
                Enviar por WhatsApp
              </button>

              <a
                href={magicLink}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 rounded-lg bg-emerald-700 text-white text-sm"
              >
                Abrir link (prueba)
              </a>
            </div>

            <div className="text-xs text-emerald-900 mt-3">
              Nota: el usuario ya existía en Auth. Envíale este link manualmente.
            </div>
          </div>
        )}

        {/* ✅ Mensaje cuando Supabase sí envió email */}
        {!!inviteData?.email_sent && (
          <div className="mt-6 border rounded-xl p-4 bg-emerald-50 border-emerald-200">
            <div className="text-sm font-medium text-emerald-800 mb-1">
              Email enviado ✅
            </div>
            <div className="text-xs text-emerald-900">
              Revisa bandeja de entrada / spam. El link lleva directo a Tracker GPS.
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
