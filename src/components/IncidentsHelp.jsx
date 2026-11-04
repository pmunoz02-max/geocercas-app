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
      ["4. Si falla el envío", "Mantén la página abierta y usa Reintentar para reenviar la misma operación sin duplicarla. No recargues ni cierres la página con datos pendientes: todavía no existen borradores persistentes ni sincronización sin conexión."],
      ["Alcance de esta versión", "Disponible únicamente en Preview y con conexión. Aún no incluye fotografías, mapa de incidencias, informes, exportación GIS ni acceso integrado desde la app Android del tracker. Visitas es un módulo distinto: admite hasta cinco fotos JPG/PNG de 2 MB cada una. El PDF de septiembre explica el seguimiento GPS y no incluye Incidencias."]
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
      ["4. If sending fails", "Keep the page open and use Retry to resend the same operation without duplicating it. Do not reload or close the page with pending data: persistent drafts and offline synchronization are not available yet."],
      ["Scope of this version", "Available online in Preview only. Photos, an incident map, reports, GIS export and integrated access from the Android tracker app are not available yet. Visits is a separate module: it supports up to five JPG/PNG photos, 2 MB each. The September PDF covers GPS tracking and does not include Incidents."]
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
      ["4. En cas d’échec de l’envoi", "Gardez la page ouverte et utilisez Réessayer pour renvoyer la même opération sans doublon. Ne rechargez pas et ne fermez pas la page avec des données en attente : les brouillons persistants et la synchronisation hors connexion ne sont pas encore disponibles."],
      ["Périmètre de cette version", "Disponible en ligne uniquement dans Preview. Les photos, la carte des incidents, les rapports, l’export GIS et l’accès intégré depuis l’application Android du tracker ne sont pas encore disponibles. Visites est un module distinct : jusqu’à cinq photos JPG/PNG de 2 Mo chacune. Le PDF de septembre décrit le suivi GPS et ne couvre pas Incidents."]
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
