import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient"; // ajusta si tu path es distinto
import { useAuth } from "../context/AuthProvider"; // ajusta si tu hook se llama distinto

const I18N = {
  es: {
    title: "Invitar tracker",
    subtitle:
      "Selecciona un miembro de personal activo o ingresa un correo manualmente para invitarlo como tracker en tu organización.",
    loaded: "Cargados",
    refresh: "Refrescar",
    emailLabel: "Correo",
    emailHint: "Se enviará una invitación a este correo.",
    send: "Enviar invitación",
    selectPerson: "Debes seleccionar un miembro de Personal.",
    missingOrg: "No se encontró org_id activo. Refresca o vuelve a iniciar sesión.",
    sending: "Enviando…",
    success: (email) => `Se envió un link mágico a ${email}.`,
    errorGeneric: "No se pudo enviar la invitación.",
    personPlaceholder: "Selecciona Personal…",
  },
  en: {
    title: "Invite tracker",
    subtitle:
      "Select an active staff member or type an email to invite them as a tracker in your organization.",
    loaded: "Loaded",
    refresh: "Refresh",
    emailLabel: "Email",
    emailHint: "An invitation will be sent to this email.",
    send: "Send invitation",
    selectPerson: "You must select a staff member.",
    missingOrg: "No active org_id found. Refresh or sign in again.",
    sending: "Sending…",
    success: (email) => `A magic link was sent to ${email}.`,
    errorGeneric: "Could not send invitation.",
    personPlaceholder: "Select Staff…",
  },
  fr: {
    title: "Inviter un tracker",
    subtitle:
      "Sélectionnez un membre du personnel actif ou saisissez un e-mail pour l’inviter comme tracker dans votre organisation.",
    loaded: "Chargés",
    refresh: "Rafraîchir",
    emailLabel: "E-mail",
    emailHint: "Une invitation sera envoyée à cet e-mail.",
    send: "Envoyer l’invitation",
    selectPerson: "Vous devez sélectionner un membre du personnel.",
    missingOrg: "Aucun org_id actif. Rafraîchissez ou reconnectez-vous.",
    sending: "Envoi…",
    success: (email) => `Un lien magique a été envoyé à ${email}.`,
    errorGeneric: "Impossible d’envoyer l’invitation.",
    personPlaceholder: "Sélectionnez Personnel…",
  },
};

export default function InvitarTracker() {
  const { currentOrg, lang } = useAuth(); // si tu AuthProvider usa otros nombres, luego lo ajusto
  const t = I18N[lang || "es"] || I18N.es;

  const org_id = currentOrg?.id || currentOrg?.org_id || null;

  const [loading, setLoading] = useState(false);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [people, setPeople] = useState([]);
  const [selectedPersonId, setSelectedPersonId] = useState("");
  const [email, setEmail] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const selectedPerson = useMemo(
    () => people.find((p) => p.id === selectedPersonId) || null,
    [people, selectedPersonId]
  );

  async function loadPeople() {
    if (!org_id) return;

    setPeopleLoading(true);
    setErrorMsg("");
    try {
      // Mismos filtros “universales”: no borrado y vigente si existe.
      // Si tu tabla usa otros nombres, me pasas tu InvitarTracker.jsx real y lo alineo.
      const { data, error } = await supabase
        .from("personal")
        .select("id, nombres, apellidos, email, is_deleted, vigente")
        .eq("org_id", org_id)
        .neq("is_deleted", true)
        .order("apellidos", { ascending: true });

      if (error) throw error;

      // Si existe vigente, filtra vigente=true (si no existe, no filtra)
      const cleaned = Array.isArray(data) ? data : [];
      const finalList = cleaned.filter((p) => {
        if (typeof p?.vigente === "boolean") return p.vigente === true;
        return true;
      });

      setPeople(finalList);
    } catch (e) {
      setErrorMsg(String(e?.message || e));
    } finally {
      setPeopleLoading(false);
    }
  }

  useEffect(() => {
    loadPeople();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [org_id]);

  // cuando selecciona persona: autocompleta email si existe
  useEffect(() => {
    if (selectedPerson?.email) setEmail(String(selectedPerson.email).trim().toLowerCase());
    // no limpiamos email si no hay, para permitir manual.
  }, [selectedPerson]);

  async function sendInvite() {
    setSuccessMsg("");
    setErrorMsg("");

    if (!org_id) {
      setErrorMsg(t.missingOrg);
      return;
    }
    if (!selectedPersonId) {
      setErrorMsg(t.selectPerson);
      return;
    }

    const safeEmail = String(email || "").trim().toLowerCase();
    if (!safeEmail) {
      setErrorMsg("email required");
      return;
    }

    const payload = {
      email: safeEmail,
      org_id,
      person_id: selectedPersonId,
      resend: false,
    };

    // LOG ÚTIL (siempre): te muestra si el i18n/refactor rompió keys
    console.log("[InvitarTracker] payload", payload);

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("invite-tracker", {
        body: payload,
      });

      if (error) {
        // intenta extraer json de error
        const msg = error?.message || t.errorGeneric;
        throw new Error(msg);
      }

      if (!data?.ok) {
        throw new Error(data?.message || t.errorGeneric);
      }

      setSuccessMsg(t.success(safeEmail));
    } catch (e) {
      setErrorMsg(String(e?.message || e || t.errorGeneric));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>{t.title}</h1>
      <p style={{ opacity: 0.8, marginBottom: 20 }}>{t.subtitle}</p>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 14, opacity: 0.8 }}>
          {t.loaded}: {people.length}
        </div>
        <button
          type="button"
          onClick={loadPeople}
          disabled={peopleLoading || !org_id}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #ddd",
            background: "#fff",
            cursor: "pointer",
          }}
        >
          {t.refresh}
        </button>
      </div>

      <div style={{ border: "1px solid #eee", borderRadius: 16, padding: 16, background: "#fff" }}>
        <div style={{ marginBottom: 12 }}>
          <select
            value={selectedPersonId}
            onChange={(e) => setSelectedPersonId(e.target.value)}
            style={{
              width: "100%",
              padding: "12px 12px",
              borderRadius: 10,
              border: "1px solid #ddd",
            }}
          >
            <option value="">{t.personPlaceholder}</option>
            {people.map((p) => {
              const full = `${p.apellidos || ""} ${p.nombres || ""}`.trim();
              const label = p.email ? `${full} — ${p.email}` : full;
              return (
                <option key={p.id} value={p.id}>
                  {label}
                </option>
              );
            })}
          </select>
        </div>

        <div style={{ marginBottom: 6, fontSize: 14, fontWeight: 600 }}>{t.emailLabel}</div>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@email.com"
          style={{
            width: "100%",
            padding: "12px 12px",
            borderRadius: 10,
            border: "1px solid #ddd",
            marginBottom: 6,
          }}
        />
        <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 16 }}>{t.emailHint}</div>

        <button
          type="button"
          onClick={sendInvite}
          disabled={loading || !org_id || !selectedPersonId}
          style={{
            width: "100%",
            padding: "14px 14px",
            borderRadius: 12,
            border: "none",
            background: loading ? "#999" : "#16a34a",
            color: "#fff",
            fontSize: 16,
            fontWeight: 700,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? t.sending : t.send}
        </button>

        {successMsg ? (
          <div style={{ marginTop: 14, padding: 12, borderRadius: 12, background: "#e7f9ee" }}>
            {successMsg}
          </div>
        ) : null}

        {errorMsg ? (
          <div style={{ marginTop: 14, padding: 12, borderRadius: 12, background: "#fde8e8" }}>
            {errorMsg}
          </div>
        ) : null}
      </div>
    </div>
  );
}
