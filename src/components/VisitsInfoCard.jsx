import React from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

const copy = {
  es: { title: "Visitas con foto y ubicaci\u00f3n", badge: "Opcional", short: "Documenta tus visitas con notas, resultados y una foto opcional con ubicaci\u00f3n al adjuntarla.", detail: "El propietario o administrador activa Visitas para su organizaci\u00f3n. Cada persona decide cu\u00e1ndo registrar una visita: selecciona una geocerca, indica el motivo, a\u00f1ade notas y finaliza el registro. Puedes adjuntar una foto del sitio, de los presentes o de un documento (JPG/PNG, hasta 2 MB). La ubicaci\u00f3n corresponde al momento de adjuntar la foto.", activation: "Activaci\u00f3n por el propietario o administrador; registro voluntario.", cta: "Abrir Visitas" },
  en: { title: "Visits with photo and location", badge: "Optional", short: "Document visits with notes, outcomes and an optional photo with location recorded when attached.", detail: "The owner or administrator enables Visits for the organization. Each person chooses when to record a visit: select a geofence, enter its purpose, add notes and finish the record. Attach a photo of the site, attendees or a document (JPG/PNG, up to 2 MB). Location is recorded when the photo is attached.", activation: "Enabled by the owner or administrator; voluntary recording.", cta: "Open Visits" },
  fr: { title: "Visites avec photo et localisation", badge: "Facultatif", short: "Documentez vos visites avec des notes, des r\u00e9sultats et une photo facultative localis\u00e9e au moment de son ajout.", detail: "Le propri\u00e9taire ou l’administrateur active Visites pour son organisation. Chaque personne choisit quand enregistrer une visite : s\u00e9lectionnez un g\u00e9orep\u00e8re, indiquez le motif, ajoutez des notes et terminez la visite. Joignez une photo du site, des personnes pr\u00e9sentes ou d’un document (JPG/PNG, 2 Mo maximum). La position est relev\u00e9e lors de l’ajout de la photo.", activation: "Activation par le propri\u00e9taire ou l’administrateur ; enregistrement volontaire.", cta: "Ouvrir Visites" }
};

export default function VisitsInfoCard({ detailed = false }) {
  const { i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage || i18n.language || "es").slice(0, 2);
  const text = copy[lang] || copy.es;
  return <article className="flex h-full flex-col rounded-2xl border border-emerald-200 bg-white p-6 text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
    <span className="w-fit rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">{text.badge}</span>
    <h2 className="mt-4 text-lg font-semibold">{text.title}</h2>
    <p className="mt-2 flex-1 text-sm leading-7 text-slate-600 dark:text-slate-300">{detailed ? text.detail : text.short}</p>
    {!detailed && <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{text.activation}</p>}
    <Link to="/visitas" className="mt-5 inline-flex w-fit items-center justify-center rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-800">{text.cta}</Link>
  </article>;
}
