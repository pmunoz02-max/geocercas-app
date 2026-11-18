import React from "react";
import { Link, useOutletContext } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FileText, MapPinned, PlayCircle } from "lucide-react";

const copy = {
  es: {
    title: "Incidencias georreferenciadas",
    summary: "Registra incidencias con GPS, parcela, notas y hasta cinco fotos privadas. Guarda registros sin conexión y sincronízalos desde el módulo al recuperar internet.",
    guide: "Consultar guía de Incidencias", open: "Abrir Incidencias",
    sections: [
      ["1. Activar el módulo", "El propietario o administrador activa Incidencias para la organización seleccionada. Está desactivado por defecto. Cada organización decide si lo utiliza."],
      ["2. Registrar una incidencia", "En el navegador, inicia sesión en la organización correspondiente. En Android, si aparece Incidencias en la pantalla de seguimiento, puedes abrirlo allí. Selecciona una parcela autorizada, escribe un título, elige categoría y afectación, pulsa Obtener ubicación GPS y añade notas. La parcela no se asigna automáticamente por el punto GPS."],
      ["3. Consultar y dar seguimiento", "Cada técnico consulta sus propios registros; el propietario o administrador consulta los de la organización. Abre el detalle para ver coordenadas, precisión, fechas e historial, y añadir observaciones a una incidencia abierta. El administrador gestiona los estados detectada, en tratamiento, controlada y cerrada, indicando el motivo del cambio."],
      ["4. Guardar sin conexión", "Abre el módulo con conexión antes de salir al campo. Al pulsar Registrar, la incidencia y sus fotos quedan guardadas en este dispositivo. Usa Sincronizar pendientes al recuperar conexión, con el módulo abierto. Los reintentos conservan los mismos identificadores. No borres los datos del sitio ni desinstales la app mientras haya pendientes. El formulario sin registrar no se guarda; abrir la app desde cero sin internet no está garantizado."],
      ["5. Adjuntar y consultar fotos", "Antes de pulsar Registrar incidencia, selecciona hasta cinco imágenes JPG/PNG del sitio o de un documento: máximo 2 MB por foto (10 MB entre las cinco). Puedes quitar una imagen antes de registrar. Esta versión permite adjuntarlas al crear la incidencia, no en observaciones posteriores. Tras sincronizar, abre el registro del historial para ver las fotos privadas. La ubicación de cada adjunto corresponde al momento de seleccionarlo, no certifica dónde se tomó la imagen."],
      ["6. Si no puedes registrar o sincronizar", "Si el módulo está desactivado, el propietario o administrador debe activarlo en esa organización. Si no hay parcelas, revisa la asignación vigente. Si aparece un rechazo de acceso, comprueba la sesión; una invitación de Producción no sirve para Preview. Si la sesión de tracker venció, acepta una nueva invitación del mismo entorno. No generes otra incidencia para sustituir un envío pendiente: conserva los datos y usa Sincronizar pendientes. Los rechazos y conflictos necesitan revisión; los pendientes no se borran automáticamente."],
      ["Prueba en Android", "Se comprobó en un móvil Android el registro sin internet con GPS y una foto, su envío al recuperar conexión y la consulta de la foto sin duplicar el registro. La sincronización requiere que el módulo esté abierto."]
    ]
  },
  en: {
    title: "Georeferenced incidents",
    summary: "Record incidents with GPS, a plot, notes and up to five private photos. Save records offline and sync from the module when internet returns.",
    guide: "Read the incidents guide", open: "Open Incidents",
    sections: [
      ["1. Enable the module", "The owner or administrator enables Incidents for the selected organization. It is disabled by default. Each organization chooses whether to use it."],
      ["2. Record an incident", "On the web, sign in to the correct organization. On Android, if Incidents appears on the tracking screen, you can open it there. Select an authorized plot, enter a title, category and severity, tap Get GPS location and add notes. The plot is not automatically assigned from the GPS point."],
      ["3. Review and follow up", "Technicians see their own records; owners and administrators see the organization's records. Open a record to view coordinates, accuracy, dates and history, and add observations to an open incident. Administrators manage detected, treating, controlled and closed statuses, providing a reason for changes."],
      ["4. Save offline", "Open the module online before going into the field. Submitting saves the incident and photos on this device. Use Sync pending submissions when connected with the module open. Retries retain the same identifiers. Do not clear site data or uninstall the app with pending records. Unsubmitted forms are not saved; starting the app offline is not guaranteed."],
      ["5. Attach and view photos", "Before tapping Record incident, select up to five JPG/PNG images of the site or a document: 2 MB per photo, 10 MB for all five. Remove unwanted images before submitting. This version attaches photos when creating an incident, not in later observations. After syncing, open the history record to view private photos. Attachment location records where the image was selected, not proof of where it was taken."],
      ["6. If recording or sync fails", "If the module is disabled, the owner or administrator must enable it for that organization. If there are no plots, check the current assignment. If access is denied, check the session; a Production invitation does not work in Preview. If the tracker session expired, accept a new invitation for the same environment. Do not create a replacement for a pending submission: keep its data and use Sync pending submissions. Rejections and conflicts require review; pending records are not automatically deleted."],
      ["Android test", "An Android phone test verified offline recording with GPS and one photo, syncing after reconnecting and viewing the photo without duplicating the record. Keep the module open while syncing."]
    ]
  },
  fr: {
    title: "Incidents géoréférencés",
    summary: "Enregistrez des incidents avec GPS, parcelle, notes et jusqu’à cinq photos privées. Conservez les enregistrements hors connexion et synchronisez-les depuis le module au retour du réseau.",
    guide: "Consulter le guide des incidents", open: "Ouvrir Incidents",
    sections: [
      ["1. Activer le module", "Le propriétaire ou l’administrateur active Incidents pour l’organisation sélectionnée. Le module est désactivé par défaut. Chaque organisation choisit de l’utiliser ou non."],
      ["2. Enregistrer un incident", "Sur le web, connectez-vous à la bonne organisation. Sur Android, si Incidents apparaît sur l’écran de suivi, vous pouvez l’y ouvrir. Sélectionnez une parcelle autorisée, saisissez titre, catégorie et gravité, appuyez sur Obtenir la position GPS et ajoutez des notes. La parcelle n’est pas attribuée automatiquement à partir du point GPS."],
      ["3. Consulter et suivre", "Les techniciens voient leurs propres enregistrements ; les propriétaires et administrateurs voient ceux de l’organisation. Ouvrez le détail pour consulter coordonnées, précision, dates et historique, et ajouter des observations à un incident ouvert. L’administrateur gère les états détecté, en traitement, maîtrisé et fermé, avec un motif pour chaque changement."],
      ["4. Enregistrer hors connexion", "Ouvrez le module avec connexion avant de partir sur le terrain. Enregistrer conserve l’incident et les photos sur cet appareil. Synchronisez les envois avec le module ouvert et une connexion. Les nouvelles tentatives conservent les identifiants. Ne videz pas le stockage et ne désinstallez pas l’application avec des envois en attente. Le formulaire non enregistré est perdu ; le démarrage hors ligne n’est pas garanti."],
      ["5. Joindre et consulter les photos", "Avant d’appuyer sur Enregistrer l’incident, sélectionnez jusqu’à cinq images JPG/PNG du site ou d’un document : 2 Mo par photo, 10 Mo pour les cinq. Retirez les images inutiles avant l’enregistrement. Cette version permet de joindre des photos à la création, pas aux observations ultérieures. Après synchronisation, ouvrez le dossier dans l’historique pour consulter les photos privées. La position est celle de l’ajout, pas une preuve du lieu de prise de vue."],
      ["6. En cas de refus ou d’échec", "Si le module est désactivé, le propriétaire ou l’administrateur doit l’activer pour cette organisation. Sans parcelle disponible, vérifiez l’affectation en cours. En cas de refus d’accès, vérifiez la session ; une invitation Production ne fonctionne pas dans Preview. Si la session du tracker a expiré, acceptez une nouvelle invitation du même environnement. Ne recréez pas un incident déjà en attente : conservez les données et utilisez Synchroniser les envois. Les refus et conflits nécessitent une vérification ; les envois en attente ne sont pas supprimés automatiquement."],
      ["Test sur Android", "Un test sur téléphone Android a confirmé l’enregistrement hors connexion avec GPS et une photo, l’envoi au retour du réseau et la consultation de la photo sans doublon. Laissez le module ouvert pendant la synchronisation."]
    ]
  }
};

const followUp = {
  es: {
    map: "Mapa de incidencias",
    mapBody: "Filtra incidencias sincronizadas y localízalas por afectación: baja en verde, media en amarillo y alta en rojo. Debajo de la tabla verás el gráfico por fecha. Abre una incidencia para ver su línea de estado o exporta el reporte filtrado en CSV.",
    measures: "Medidas tomadas",
    measuresBody: "En Incidencias, abre un registro del Historial y selecciona Guardar medida después de describir qué se hizo. Los administradores y propietarios pueden añadir medidas, incluso a incidencias cerradas. Los trackers pueden leerlas en los registros a los que tienen acceso.",
    guide: "Guía completa (PDF)",
    video: "Ver video",
  },
  en: {
    map: "Incident map",
    mapBody: "Filter synced incidents and locate them by severity: green for low, yellow for medium and red for high. The bar chart below the table counts incidents by observation date. Open an incident to see its status timeline, or export the filtered report as CSV.",
    measures: "Actions taken",
    measuresBody: "In Incidents, open a record from History, describe what was done and select Save action. Administrators and owners can add actions even to closed incidents. Trackers can read actions on records they have permission to access.",
    guide: "Complete guide (PDF)",
    video: "Watch video",
  },
  fr: {
    map: "Carte des incidents",
    mapBody: "Filtrez les incidents synchronisés et repérez-les par gravité : vert pour faible, jaune pour moyenne et rouge pour élevée. Sous le tableau, le graphique compte les incidents par date d’observation. Ouvrez une fiche pour voir la chronologie du statut ou exportez le rapport filtré en CSV.",
    measures: "Mesures prises",
    measuresBody: "Dans Incidents, ouvrez une fiche depuis l’Historique, décrivez l’action et cliquez sur Enregistrer la mesure. Les administrateurs et propriétaires peuvent ajouter une mesure à un incident clôturé. Les agents peuvent la lire lorsqu’ils ont accès à l’incident.",
    guide: "Guide complet (PDF)",
    video: "Voir la vidéo",
  },
};

const actionClass = "inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600";
const linkClass = "inline-flex items-center gap-2 rounded-xl border border-emerald-200 px-4 py-2.5 text-sm font-semibold text-emerald-800 hover:bg-emerald-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:border-emerald-800 dark:text-emerald-200 dark:hover:bg-emerald-950";

export default function IncidentsHelp({ detailed = false, featured = false }) {
  const { i18n } = useTranslation();
  const { navigationTabs = [] } = useOutletContext() || {};
  const hostname = typeof window === "undefined" ? "" : window.location.hostname;
  const preview = hostname === "preview.tugeocercas.com";
  if (!preview && hostname !== "app.tugeocercas.com") return null;

  const language = (i18n.resolvedLanguage || i18n.language || "es").slice(0, 2);
  const lang = copy[language] ? language : "es";
  const text = copy[lang];
  const features = followUp[lang];
  const incidents = navigationTabs.find(tab => tab.path === "/incidencias");
  const map = navigationTabs.find(tab => tab.path === "/mapa-incidencias");
  if (featured && !incidents) return null;

  const showFollowUp = preview && (detailed || (featured && map));
  const routes = path => `${path}?lang=${lang}`;

  return (
    <article id={detailed ? "incidencias" : undefined} className="rounded-2xl border border-emerald-200 bg-white p-6 text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
      <h2 className="text-xl font-bold">{text.title}</h2>
      <p className="mt-2 text-sm leading-6">{text.summary}</p>
      {showFollowUp && (
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <section className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
            <h3 className="font-semibold">{features.map}</h3>
            <p className="mt-2 text-sm leading-6">{features.mapBody}</p>
          </section>
          <section className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
            <h3 className="font-semibold">{features.measures}</h3>
            <p className="mt-2 text-sm leading-6">{features.measuresBody}</p>
          </section>
        </div>
      )}
      {detailed && text.sections.map(([title, body]) => (
        <section key={title} className="mt-5">
          <h3 className="font-semibold">{title}</h3>
          <p className="mt-2 text-sm leading-7">{body}</p>
        </section>
      ))}
      <div className="mt-5 flex flex-wrap gap-3">
        {featured && map && preview && (
          <Link className={actionClass} to={routes(map.path)}><MapPinned size={18} aria-hidden="true" />{features.map}</Link>
        )}
        {(featured || detailed) && (
          <Link className={featured && map && preview ? linkClass : actionClass} to={routes("/incidencias")}>{text.open}</Link>
        )}
        {!detailed && <Link className={featured ? linkClass : actionClass} to={`${routes("/help/instructions")}#incidencias`}>{text.guide}</Link>}
        {featured && preview && (
          <>
            <a className={linkClass} href={`/resources/preview-nov2026/guide-${lang}.pdf`} target="_blank" rel="noreferrer">
              <FileText size={18} aria-hidden="true" />{features.guide}
            </a>
            <a className={linkClass} href={`/resources/preview-nov2026/video-${lang}.mp4`} target="_blank" rel="noreferrer">
              <PlayCircle size={18} aria-hidden="true" />{features.video}
            </a>
          </>
        )}
      </div>
    </article>
  );
}
