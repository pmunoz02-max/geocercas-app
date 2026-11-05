import React from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

const copy = {
  es: {
    title: "Incidencias georreferenciadas", badge: "Opcional",
    summary: "Registra incidencias con GPS, parcela, notas y hasta cinco fotos privadas. Guarda registros sin conexión y sincronízalos desde el módulo al recuperar internet.",
    guide: "Consultar guía de Incidencias", open: "Abrir Incidencias",
    sections: [
      ["1. Activar el módulo", "El propietario o administrador activa Incidencias para la organización seleccionada. Está desactivado por defecto. Cada organización decide si lo utiliza."],
      ["2. Registrar una incidencia", "En el navegador, inicia sesión en la organización correspondiente. En Android, si aparece Incidencias en la pantalla de seguimiento, puedes abrirlo allí. Selecciona una parcela autorizada, escribe un título, elige categoría y afectación, pulsa Obtener ubicación GPS y añade notas. La parcela no se asigna automáticamente por el punto GPS."],
      ["3. Consultar y dar seguimiento", "Cada técnico consulta sus propios registros; el propietario o administrador consulta los de la organización. Abre el detalle para ver coordenadas, precisión, fechas e historial, y añadir observaciones a una incidencia abierta. El administrador gestiona los estados detectada, en tratamiento, controlada y cerrada, indicando el motivo del cambio."],
      ["4. Guardar sin conexión", "Abre el módulo con conexión antes de salir al campo. Al pulsar Registrar, la incidencia y sus fotos quedan guardadas en este dispositivo. Usa Sincronizar pendientes al recuperar conexión, con el módulo abierto. Los reintentos conservan los mismos identificadores. No borres los datos del sitio ni desinstales la app mientras haya pendientes. El formulario sin registrar no se guarda; abrir la app desde cero sin internet no está garantizado."],
      ["5. Adjuntar y consultar fotos", "Antes de pulsar Registrar incidencia, selecciona hasta cinco imágenes JPG/PNG del sitio o de un documento: máximo 2 MB por foto (10 MB entre las cinco). Puedes quitar una imagen antes de registrar. Esta versión permite adjuntarlas al crear la incidencia, no en observaciones posteriores. Tras sincronizar, abre el registro del historial para ver las fotos privadas. La ubicación de cada adjunto corresponde al momento de seleccionarlo, no certifica dónde se tomó la imagen."],
      ["6. Si no puedes registrar o sincronizar", "Si el módulo está desactivado, el propietario o administrador debe activarlo en esa organización. Si no hay parcelas, revisa la asignación vigente. Si aparece un rechazo de acceso, comprueba la sesión; una invitación de Producción no sirve para Preview. Si la sesión de tracker venció, acepta una nueva invitación del mismo entorno. No generes otra incidencia para sustituir un envío pendiente: conserva los datos y usa Sincronizar pendientes. Los rechazos y conflictos necesitan revisión; los pendientes no se borran automáticamente."],
      ["Qué está comprobado y qué falta", "Se comprobó en un móvil Android el registro sin internet con GPS y una foto, su envío al recuperar conexión y la consulta de la foto sin duplicar el registro. La sincronización requiere el módulo abierto; no se garantiza abrir la app desde cero sin red. Siguen pendientes el mapa de incidencias, informes y exportación GIS. El PDF de septiembre explica seguimiento GPS; esta guía web contiene las novedades de Incidencias."]
    ]
  },
  en: {
    title: "Georeferenced incidents", badge: "Optional",
    summary: "Record incidents with GPS, a plot, notes and up to five private photos. Save records offline and sync from the module when internet returns.",
    guide: "Read the incidents guide", open: "Open Incidents",
    sections: [
      ["1. Enable the module", "The owner or administrator enables Incidents for the selected organization. It is disabled by default. Each organization chooses whether to use it."],
      ["2. Record an incident", "On the web, sign in to the correct organization. On Android, if Incidents appears on the tracking screen, you can open it there. Select an authorized plot, enter a title, category and severity, tap Get GPS location and add notes. The plot is not automatically assigned from the GPS point."],
      ["3. Review and follow up", "Technicians see their own records; owners and administrators see the organization's records. Open a record to view coordinates, accuracy, dates and history, and add observations to an open incident. Administrators manage detected, treating, controlled and closed statuses, providing a reason for changes."],
      ["4. Save offline", "Open the module online before going into the field. Submitting saves the incident and photos on this device. Use Sync pending submissions when connected with the module open. Retries retain the same identifiers. Do not clear site data or uninstall the app with pending records. Unsubmitted forms are not saved; starting the app offline is not guaranteed."],
      ["5. Attach and view photos", "Before tapping Record incident, select up to five JPG/PNG images of the site or a document: 2 MB per photo, 10 MB for all five. Remove unwanted images before submitting. This version attaches photos when creating an incident, not in later observations. After syncing, open the history record to view private photos. Attachment location records where the image was selected, not proof of where it was taken."],
      ["6. If recording or sync fails", "If the module is disabled, the owner or administrator must enable it for that organization. If there are no plots, check the current assignment. If access is denied, check the session; a Production invitation does not work in Preview. If the tracker session expired, accept a new invitation for the same environment. Do not create a replacement for a pending submission: keep its data and use Sync pending submissions. Rejections and conflicts require review; pending records are not automatically deleted."],
      ["Verified scope and remaining work", "An Android phone test verified offline recording with GPS and one photo, transmission when connectivity returned and viewing the photo without duplicating the record. Sync requires the module to remain open; starting the app offline is not guaranteed. Incident maps, reports and GIS export remain pending. The September PDF covers GPS tracking; this web guide covers the latest incident features."]
    ]
  },
  fr: {
    title: "Incidents géoréférencés", badge: "Facultatif",
    summary: "Enregistrez des incidents avec GPS, parcelle, notes et jusqu’à cinq photos privées. Conservez les enregistrements hors connexion et synchronisez-les depuis le module au retour du réseau.",
    guide: "Consulter le guide des incidents", open: "Ouvrir Incidents",
    sections: [
      ["1. Activer le module", "Le propriétaire ou l’administrateur active Incidents pour l’organisation sélectionnée. Le module est désactivé par défaut. Chaque organisation choisit de l’utiliser ou non."],
      ["2. Enregistrer un incident", "Sur le web, connectez-vous à la bonne organisation. Sur Android, si Incidents apparaît sur l’écran de suivi, vous pouvez l’y ouvrir. Sélectionnez une parcelle autorisée, saisissez titre, catégorie et gravité, appuyez sur Obtenir la position GPS et ajoutez des notes. La parcelle n’est pas attribuée automatiquement à partir du point GPS."],
      ["3. Consulter et suivre", "Les techniciens voient leurs propres enregistrements ; les propriétaires et administrateurs voient ceux de l’organisation. Ouvrez le détail pour consulter coordonnées, précision, dates et historique, et ajouter des observations à un incident ouvert. L’administrateur gère les états détecté, en traitement, maîtrisé et fermé, avec un motif pour chaque changement."],
      ["4. Enregistrer hors connexion", "Ouvrez le module avec connexion avant de partir sur le terrain. Enregistrer conserve l’incident et les photos sur cet appareil. Synchronisez les envois avec le module ouvert et une connexion. Les nouvelles tentatives conservent les identifiants. Ne videz pas le stockage et ne désinstallez pas l’application avec des envois en attente. Le formulaire non enregistré est perdu ; le démarrage hors ligne n’est pas garanti."],
      ["5. Joindre et consulter les photos", "Avant d’appuyer sur Enregistrer l’incident, sélectionnez jusqu’à cinq images JPG/PNG du site ou d’un document : 2 Mo par photo, 10 Mo pour les cinq. Retirez les images inutiles avant l’enregistrement. Cette version permet de joindre des photos à la création, pas aux observations ultérieures. Après synchronisation, ouvrez le dossier dans l’historique pour consulter les photos privées. La position est celle de l’ajout, pas une preuve du lieu de prise de vue."],
      ["6. En cas de refus ou d’échec", "Si le module est désactivé, le propriétaire ou l’administrateur doit l’activer pour cette organisation. Sans parcelle disponible, vérifiez l’affectation en cours. En cas de refus d’accès, vérifiez la session ; une invitation Production ne fonctionne pas dans Preview. Si la session du tracker a expiré, acceptez une nouvelle invitation du même environnement. Ne recréez pas un incident déjà en attente : conservez les données et utilisez Synchroniser les envois. Les refus et conflits nécessitent une vérification ; les envois en attente ne sont pas supprimés automatiquement."],
      ["Périmètre vérifié et prochaines étapes", "Un test sur téléphone Android a confirmé l’enregistrement hors connexion avec GPS et une photo, l’envoi au retour du réseau et la consultation de la photo sans doublon. La synchronisation nécessite le module ouvert ; le démarrage sans réseau n’est pas garanti. Carte, rapports et export GIS restent à développer. Le PDF de septembre décrit le suivi GPS ; ce guide web présente les nouveautés des incidents."]
    ]
  }
};

export default function IncidentsHelp({ detailed = false }) {
  const { i18n } = useTranslation();
  if (typeof window === "undefined" || !["preview.tugeocercas.com", "app.tugeocercas.com"].includes(window.location.hostname)) return null;
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
