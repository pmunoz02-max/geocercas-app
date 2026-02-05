import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthProvider";

const I18N = {
  es: {
    title: "Invitar tracker",
    subtitle:
      "Selecciona un miembro de personal activo o ingresa un correo manualmente para invitarlo como tracker en tu organización.",
    loaded: "Cargados",
    refresh: "Refrescar",
    personPlaceholder: "Selecciona Personal…",
    emailPlaceholder: "name@email.com",
    emailHint: "Se enviará una invitación a este correo.",
    send: "Enviar invitación",
    resend: "Reenviar a tracker registrado",
    sending: "Enviando…",
    resending: "Reenviando…",
    selectPerson: "Debes seleccionar un miembro de Personal.",
    missingOrg: "No se encontró org_id activo. Refresca o vuelve a iniciar sesión.",
    emailRequired: "Debes ingresar un correo.",
    success: (email) => `Se envió un link mágico a ${email}.`,
    resentOk: (email) => `Se reenviaron credenciales a ${email}.`,
    genericError: "No se pudo enviar la invitación.",
  },
  en: {
    title: "Invite tracker",
    subtitle:
      "Select an active staff member or enter an email to invite them as a tracker in your organization.",
    loaded: "Loaded",
    refresh: "Refresh",
    personPlaceholder: "Select Staff…",
    emailPlaceholder: "name@email.com",
    emailHint: "An invitation will be sent to this email.",
    send: "Send invitation",
    resend: "Resend to registered tracker",
    sending: "Sending…",
    resending: "Resending…",
    selectPerson: "You must select a staff member.",
    missingOrg: "No active org_id found. Refresh or sign in again.",
    emailRequired: "You must enter an email.",
    success: (email) => `A magic link was sent to ${email}.`,
    resentOk: (email) => `Credentials were resent to ${email}.`,
    genericError: "Could not send invitation.",
  },
  fr: {
    title: "Inviter un tracker",
    subtitle:
      "Sélectionnez un membre du personnel actif ou saisissez un e-mail pour l’inviter comme tracker dans votre organisation.",
    loaded: "Chargés",
    refresh: "Rafraîchir",
    personPlaceholder: "Sélectionnez Personnel…",
    emailPlaceholder: "name@email.com",
    emailHint: "Une invitation sera envoyée à cet e-mail.",
    send: "Envoyer l’invitation",
    resend: "Renvoyer au tracker enregistré",
    sending: "Envoi…",
    resending: "Renvoi…",
    selectPerson: "Vous devez sélectionner un membre du personnel.",
    missingOrg: "Aucun org_id actif. Rafraîchissez ou reconnectez-vous.",
    emailRequired: "Vous devez saisir un e-mail.",
    success: (email) => `Un lien magique a été envoyé à ${email}.`,
    resentOk: (email) => `Les accès ont été renvoyés à ${email}.`,
    genericError: "Impossible d’envoyer l’invitation.",
  },
};

const normEmail = (v) => String(v || "").trim().toLowerCase();

function buildLabel(p) {
  const a = String(p?.apellidos || p?.apellido || p?.last_name || p?.lastname || "").trim();
  const n = String(p?.nombres || p?.nombre || p?.first_name || p?.firstname || "").trim();
  const full = String(p?.full_name || p?.fullname || p?.display_name || p?.name || "").trim();
  const email = String(p?.email || "").trim();

  const base = (a || n) ? `${a} ${n}`.trim() : (full || "");
  if (base && email) return `${base} — ${email}`;
  if (base) return base;
  if (email) return email;
  return String(p?.id || "Personal");
}

async function trySelect(queryFn) {
  const { data, error, usedSelect } = await queryFn();
  if (!error) return { data: Array.isArray(data) ? data : [], usedSelect };
  const msg = String(error?.message || "");
  const missingCol = msg.toLowerCase().includes("does not exist") && msg.toLowerCase().includes("column");
  return { error, missingCol, usedSelect };
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
    if (selectedPerson?.email) setEmail(normEmail(selectedPerson.email));
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
      const tries = [
        async () => {
          const q = supabase
            .from("personal")
            .select("id,email,nombres,apellidos,is_deleted,vigente")
            .eq("org_id", org_id)
            .neq("is_deleted", true)
            .order("apellidos", { ascending: true });
          const { data, error } = await q;
          return { data, error, usedSelect: "id,email,nombres,apellidos,is_deleted,vigente" };
        },
        async () => {
          const q = supabase
            .from("personal")
            .select("id,email,nombre,apellido,is_deleted,vigente")
            .eq("org_id", org_id)
            .neq("is_deleted", true)
            .order("apellido", { ascending: true });
          const { data, error } = await q;
          return { data, error, usedSelect: "id,email,nombre,apellido,is_deleted,vigente" };
        },
        async () => {
          const q = supabase
            .from("personal")
            .select("id,email,first_name,last_name,is_deleted,vigente")
            .eq("org_id", org_id)
            .neq("is_deleted", true)
            .order("last_name", { ascending: true });
          const { data, error } = await q;
          return { data, error, usedSelect: "id,email,first_name,last_name,is_deleted,vigente" };
        },
        async () => {
          const q = supabase
            .from("personal")
            .select("id,email,full_name,is_deleted,vigente")
            .eq("org_id", org_id)
            .neq("is_deleted", true)
            .order("full_name", { ascending: true });
          const { data, error } = await q;
          return { data, error, usedSelect: "id,email,full_name,is_deleted,vigente" };
        },
        async () => {
          const q = supabase
            .from("personal")
            .select("id,email,is_deleted,vigente")
            .eq("org_id", org_id)
            .neq("is_deleted", true)
            .order("email", { ascending: true });
          const { data, error } = await q;
          return { data, error, usedSelect: "id,email,is_deleted,vigente" };
        },
        async () => {
          const q = supabase
            .from("personal")
            .select("id,email")
            .eq("org_id", org_id)
            .order("email", { ascending: true });
          const { data, error } = await q;
          return { data, error, usedSelect: "id,email" };
        },
      ];

      let final = [];
      let used = "none";

      for (const fn of tries) {
        const r = await trySelect(fn);
        if (!r.error) {
          final = r.data;
          used = r.usedSelect;
          break;
        }
        if (!r.missingCol) throw r.error;
      }

      final = final.filter((p) => (typeof p?.vigente === "boolean" ? p.vigente === true : true));

      setPeople(final);
      if (selectedPersonId && !final.some((p) => p.id === selectedPersonId)) {
        setSelectedPersonId("");
      }

      console.log("[InvitarTracker] personal loaded select:", used, "count:", final.length);
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

    const payload = { email: safeEmail, org_id, person_id: selectedPersonId, resend: Boolean(resend) };
    console.log("[InvitarTracker] payload", payload);

    try {
      const { data, error } = await supabase.functions.invoke("invite-tracker", { body: payload });
      if (error) throw new Error(error.message || t.genericError);
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

  const canSend = Boolean(org_id && selectedPersonId);
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
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t.emailPlaceholder}
          className="w-full mt-3 p-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500"
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

        {/* ✅ Botón Reenviar */}
        <button
          type="button"
          onClick={resendInvite}
          disabled={resending || !canResend}
          className="w-full mt-3 py-4 rounded-xl font-bold border border-blue-300 bg-blue-50 text-blue-800 hover:bg-blue-100 disabled:opacity-60"
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
