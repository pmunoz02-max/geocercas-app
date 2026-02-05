import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthProvider";

const I18N = {
  es: {
    title: "Invitar tracker",
    subtitle:
      "Selecciona un miembro de personal activo para invitarlo como tracker en tu organización.",
    loaded: "Cargados",
    refresh: "Refrescar",
    personPlaceholder: "Selecciona Personal…",
    emailHint:
      "El acceso se enviará directamente por correo. Al abrir el link, el tracker ingresará automáticamente a Tracker GPS.",
    send: "Enviar invitación",
    resend: "Reenviar acceso (email)",
    sending: "Enviando…",
    resending: "Reenviando…",
    selectPerson: "Debes seleccionar un miembro de Personal.",
    missingOrg: "No se encontró org_id activo. Refresca o vuelve a iniciar sesión.",
    emailRequired: "El registro de Personal seleccionado no tiene email.",
    success: (email) => `Se envió una invitación a ${email}.`,
    resentOk: (email) => `Se reenviaron credenciales a ${email}.`,
    genericError: "No se pudo completar la operación.",
  },
  en: {
    title: "Invite tracker",
    subtitle: "Select an active staff member to invite them as a tracker.",
    loaded: "Loaded",
    refresh: "Refresh",
    personPlaceholder: "Select Staff…",
    emailHint:
      "Access will be emailed directly. When the tracker opens the link, they will be redirected to Tracker GPS automatically.",
    send: "Send invitation",
    resend: "Resend access (email)",
    sending: "Sending…",
    resending: "Resending…",
    selectPerson: "You must select a staff member.",
    missingOrg: "No active org_id found. Refresh or sign in again.",
    emailRequired: "Selected staff record has no email.",
    success: (email) => `Invitation was sent to ${email}.`,
    resentOk: (email) => `Credentials were resent to ${email}.`,
    genericError: "Could not complete the operation.",
  },
  fr: {
    title: "Inviter un tracker",
    subtitle: "Sélectionnez un membre du personnel actif pour l’inviter.",
    loaded: "Chargés",
    refresh: "Rafraîchir",
    personPlaceholder: "Sélectionnez Personnel…",
    emailHint:
      "L’accès sera envoyé directement par e-mail. En ouvrant le lien, le tracker sera redirigé automatiquement vers Tracker GPS.",
    send: "Envoyer l’invitation",
    resend: "Renvoyer l’accès (email)",
    sending: "Envoi…",
    resending: "Renvoi…",
    selectPerson: "Vous devez sélectionner un membre du personnel.",
    missingOrg: "Aucun org_id actif. Rafraîchissez ou reconnectez-vous.",
    emailRequired: "Le membre sélectionné n’a pas d’e-mail.",
    success: (email) => `Invitation envoyée à ${email}.`,
    resentOk: (email) => `Accès renvoyé à ${email}.`,
    genericError: "Impossible de terminer l’opération.",
  },
};

const normEmail = (v) => String(v || "").trim().toLowerCase();

function buildLabel(p) {
  const a = String(p?.apellido || "").trim();
  const n = String(p?.nombre || "").trim();
  const email = String(p?.email || "").trim();

  const base = (a || n) ? `${a} ${n}`.trim() : "";
  if (base && email) return `${base} — ${email}`;
  if (base) return base;
  if (email) return email;
  return String(p?.id || "Personal");
}

async function readContextBody(body) {
  if (!body) return null;
  try {
    if (typeof body === "string") return body;
    if (typeof body === "object" && typeof body.getReader === "function") {
      return await new Response(body).text();
    }
    return body;
  } catch {
    return null;
  }
}

async function extractFunctionError(error) {
  const ctx = error?.context;
  if (!ctx) return null;
  const raw = await readContextBody(ctx.body);
  if (!raw) return null;
  try {
    if (typeof raw === "string") return JSON.parse(raw);
    return raw;
  } catch {
    return { raw: String(raw) };
  }
}

export default function InvitarTracker() {
  const { currentOrg, lang } = useAuth();
  const t = I18N[lang || "es"] || I18N.es;

  const org_id = currentOrg?.id || currentOrg?.org_id || null;

  const [people, setPeople] = useState([]);
  const [selectedPersonId, setSelectedPersonId] = useState("");
  const [email, setEmail] = useState("");

  const [peopleLoading, setPeopleLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [resending, setResending] = useState(false);

  const [okMsg, setOkMsg] = useState("");
  const [errMsg, setErrMsg] = useState("");

  const selectedPerson = useMemo(
    () => people.find((p) => p.id === selectedPersonId) || null,
    [people, selectedPersonId]
  );

  useEffect(() => {
    // El email queda siempre alineado a Personal (sin modo manual)
    setEmail(selectedPerson?.email ? normEmail(selectedPerson.email) : "");
  }, [selectedPerson]);

  async function loadPeople() {
    if (!org_id) {
      setPeople([]);
      setSelectedPersonId("");
      return;
    }

    setPeopleLoading(true);
    setErrMsg("");
    try {
      const { data, error } = await supabase
        .from("personal")
        .select("id,email,nombre,apellido,is_deleted,vigente,activo")
        .eq("org_id", org_id)
        .neq("is_deleted", true)
        .order("apellido", { ascending: true })
        .order("nombre", { ascending: true });

      if (error) throw error;

      const list = (Array.isArray(data) ? data : []).filter((p) => {
        const vigenteOk = typeof p?.vigente === "boolean" ? p.vigente === true : true;
        const activoOk = typeof p?.activo === "boolean" ? p.activo === true : true;
        return vigenteOk && activoOk;
      });

      setPeople(list);

      if (selectedPersonId && !list.some((p) => p.id === selectedPersonId)) {
        setSelectedPersonId("");
      }
    } catch (e) {
      setPeople([]);
      setSelectedPersonId("");
      setErrMsg(String(e?.message || e));
    } finally {
      setPeopleLoading(false);
    }
  }

  useEffect(() => {
    loadPeople();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [org_id]);

  async function callInvite({ resend }) {
    setOkMsg("");
    setErrMsg("");

    if (!org_id) return setErrMsg(t.missingOrg);
    if (!selectedPersonId) return setErrMsg(t.selectPerson);

    const safeEmail = normEmail(email);
    if (!safeEmail) return setErrMsg(t.emailRequired);

    const payload = {
      email: safeEmail,
      org_id,
      person_id: selectedPersonId,
      resend: Boolean(resend),
      // redirectTo se controla por env en la Edge Function (INVITE_REDIRECT_TO),
      // para garantizar entrada automática a Tracker GPS.
    };

    try {
      const { data, error } = await supabase.functions.invoke("invite_tracker", {
        body: payload,
      });

      if (error) {
        const details = await extractFunctionError(error);
        const backendMsg = details?.message || details?.error || details?.raw || null;
        throw new Error(backendMsg || error.message || t.genericError);
      }

      if (!data?.ok) throw new Error(data?.message || t.genericError);

      setOkMsg(resend ? t.resentOk(safeEmail) : t.success(safeEmail));
    } catch (e) {
      setErrMsg(String(e?.message || e || t.genericError));
    }
  }

  async function sendInvite() {
    setSending(true);
    try {
      await callInvite({ resend: false });
    } finally {
      setSending(false);
    }
  }

  async function resendInvite() {
    setResending(true);
    try {
      await callInvite({ resend: true });
    } finally {
      setResending(false);
    }
  }

  const canSend = Boolean(org_id && selectedPersonId && normEmail(email));
  const canResend = Boolean(org_id && selectedPersonId && normEmail(email));

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-2">{t.title}</h1>
      <p className="text-gray-600 mb-4">{t.subtitle}</p>

      <div className="flex items-center gap-3 mb-3">
        <div className="text-sm text-gray-600">
          {t.loaded}: {people.length}
        </div>
        <button
          type="button"
          onClick={loadPeople}
          disabled={peopleLoading || !org_id}
          className="px-4 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-60"
        >
          {t.refresh}
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-4">
        <select
          value={selectedPersonId}
          onChange={(e) => setSelectedPersonId(e.target.value)}
          className="w-full p-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="">{t.personPlaceholder}</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {buildLabel(p)}
            </option>
          ))}
        </select>

        <input
          value={email}
          readOnly
          className="w-full mt-3 p-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-700"
        />

        <div className="text-xs text-gray-500 mt-1">{t.emailHint}</div>

        <button
          type="button"
          onClick={sendInvite}
          disabled={sending || !canSend}
          className="w-full mt-4 py-4 rounded-xl font-bold text-white bg-green-600 hover:bg-green-700 disabled:opacity-60"
        >
          {sending ? t.sending : t.send}
        </button>

        <button
          type="button"
          onClick={resendInvite}
          disabled={resending || !canResend}
          className="w-full mt-3 py-4 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-600"
        >
          {resending ? t.resending : t.resend}
        </button>

        {okMsg ? (
          <div className="mt-4 p-3 rounded-xl border border-green-200 bg-green-50 text-green-800">
            {okMsg}
          </div>
        ) : null}

        {errMsg ? (
          <div className="mt-4 p-3 rounded-xl border border-red-200 bg-red-50 text-red-800 break-words">
            {errMsg}
          </div>
        ) : null}
      </div>
    </div>
  );
}
