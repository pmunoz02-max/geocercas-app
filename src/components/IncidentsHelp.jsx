import React from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

const copy = {
  es: {
    title: "Incidencias georreferenciadas", badge: "Opcional · Solo Preview",
    summary: "Registra problemas con punto GPS, parcela, categoría, nivel de afectación y notas. Consulta su evolución y gestiona su estado.",
    guide: "Consultar guía de Incidencias", open: "Abrir Incidencias",
    sections: [
      ["1. Activar el módulo", "El propietario o administrador activa Incidencias para la organización seleccionada. Está desactivado por defecto. Cada organización decide si lo utiliza."],
      ["2. Registrar una incidencia", "Accede desde el navegador con tu sesión web. Selecciona una parcela autorizada, escribe un título, elige categoría y nivel de afectación, permite el acceso a la ubicación y añade notas. La parcela se selecciona explícitamente; no se asigna automáticamente por el punto GPS."],
      ["3. Consultar y dar seguimiento", "Cada técnico consulta sus propios registros; el propietario o administrador consulta los de la organización. Abre el detalle para ver coordenadas, precisión, fechas e historial, y añadir observaciones a una incidencia abierta. El administrador gestiona los estados detectada, en tratamiento, controlada y cerrada, indicando el motivo del cambio."],
      ["4. Guardar sin conexión", "Abre el módulo con conexión antes de salir al campo. Al pulsar Registrar, la incidencia y sus fotos quedan guardadas en este dispositivo. Usa Sincronizar pendientes al recuperar conexión, con el módulo abierto. Los reintentos conservan los mismos identificadores. No borres los datos del sitio ni desinstales la app mientras haya pendientes. El formulario sin registrar no se guarda; abrir la app desde cero sin internet no está garantizado."],
      ["Alcance de esta versión", "Solo Preview: adjunta hasta cinco fotos privadas JPG/PNG de 2 MB cada una al registrar una incidencia. La ubicación corresponde al momento de adjuntar, no certifica dónde se tomó la imagen. En el móvil, abre Incidencias en la pantalla de seguimiento con la actualización Android de Preview 21. Pendientes: mapa, informes y exportación GIS. El PDF de septiembre trata sobre seguimiento GPS."]
    ]
  },
  en: {
    title: "Georeferenced incidents", badge: "Optional · Preview only",
    summary: "Record problems with a GPS point, plot, category, severity and notes. Review their history and manage their status.",
    guide: "Read the incidents guide", open: "Open Incidents",
    sections: [
      ["1. Enable the module", "The owner or administrator enables Incidents for the selected organization. It is disabled by default. Each organization chooses whether to use it."],
      ["2. Record an incident", "Sign in through your web browser. Select an authorized plot, enter a title, category and severity, allow location access and add notes. Select the plot explicitly; it is not automatically assigned from the GPS point."],
      ["3. Review and follow up", "Technicians see their own records; owners and administrators see the organization's records. Open a record to view coordinates, accuracy, dates and history, and add observations to an open incident. Administrators manage detected, treating, controlled and closed statuses, providing a reason for changes."],
      ["4. Save offline", "Open the module online before going into the field. Submitting saves the incident and photos on this device. Use Sync pending submissions when connected with the module open. Retries retain the same identifiers. Do not clear site data or uninstall the app with pending records. Unsubmitted forms are not saved; starting the app offline is not guaranteed."],
      ["Scope of this version", "Preview only: attach up to five private JPG/PNG photos of 2 MB each when recording an incident. Attachment location does not certify where a photo was taken. On mobile, open Incidents from the tracking screen with Preview Android update 21. Incident maps, reports and GIS export remain pending. The September PDF covers GPS tracking."]
    ]
  },
  fr: {
    title: "Incidents géoréférencés", badge: "Facultatif · Preview uniquement",
    summary: "Documentez les problèmes avec un point GPS, une parcelle, une catégorie, un niveau de gravité et des notes. Consultez leur historique et gérez leur état.",
    guide: "Consulter le guide des incidents", open: "Ouvrir Incidents",
    sections: [
      ["1. Activer le module", "Le propriétaire ou l’administrateur active Incidents pour l’organisation sélectionnée. Le module est désactivé par défaut. Chaque organisation choisit de l’utiliser ou non."],
      ["2. Enregistrer un incident", "Connectez-vous dans votre navigateur. Sélectionnez une parcelle autorisée, saisissez un titre, une catégorie et un niveau de gravité, autorisez la localisation et ajoutez des notes. La parcelle doit être sélectionnée explicitement ; elle n’est pas attribuée automatiquement à partir du point GPS."],
      ["3. Consulter et suivre", "Les techniciens voient leurs propres enregistrements ; les propriétaires et administrateurs voient ceux de l’organisation. Ouvrez le détail pour consulter coordonnées, précision, dates et historique, et ajouter des observations à un incident ouvert. L’administrateur gère les états détecté, en traitement, maîtrisé et fermé, avec un motif pour chaque changement."],
      ["4. Enregistrer hors connexion", "Ouvrez le module avec connexion avant de partir sur le terrain. Enregistrer conserve l’incident et les photos sur cet appareil. Synchronisez les envois avec le module ouvert et une connexion. Les nouvelles tentatives conservent les identifiants. Ne videz pas le stockage et ne désinstallez pas l’application avec des envois en attente. Le formulaire non enregistré est perdu ; le démarrage hors ligne n’est pas garanti."],
      ["Périmètre de cette version", "Preview uniquement : joignez jusqu’à cinq photos privées JPG/PNG de 2 Mo chacune lors de l’enregistrement. Leur position correspond à l’ajout et ne certifie pas le lieu de prise de vue. Sur mobile, ouvrez Incidents depuis le suivi avec la mise à jour Android Preview 21. Carte, rapports et export GIS restent à développer. Le PDF de septembre décrit le suivi GPS."]
    ]
  }
};

export default function IncidentsHelp({ detailed = false }) {
  const { i18n } = useTranslation();
  if (typeof window === "undefined" || window.location.hostname !== "preview.tugeocercas.com") return null;
  const lang = (i18n.resolvedLanguage || i18n.language || "es").slice(0, 2);
  const text = copy[lang] || copy.es;
  return <article id={detailed ? "incidencias" : undefined} className="rounded-2xl border border-emerald-200 bg-white p-6 text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
    <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">{text.badge}</span>
    <h2 className="mt-4 text-xl font-bold">{text.title}</h2>
    <p className="mt-3 text-sm leading-7">{text.summary}</p>
    {detailed && text.sections.map(([title, body]) => <section key={title} className="mt-5"><h3 className="font-semibold">{title}</h3><p className="mt-2 text-sm leading-7">{body}</p></section>)}
    <Link className="mt-5 inline-flex rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-800" to={detailed ? "/incidencias" : "/help/instructions#incidencias"}>{detailed ? text.open : text.guide}</Link>
  </article>;
}
