const fs = require("fs");

const file = "src/i18n/fr.json";
const raw = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
const data = JSON.parse(raw);

const exact = new Map([
  ["Nueva geocerca", "Nouvelle géofence"],
  ["Dibuja una geocerca en el mapa y asígnala a tu personal o actividades.", "Dessinez une géofence sur la carte et assignez-la à votre personnel ou à vos activités."],
  ["Nombre de la zona", "Nom de la zone"],
  ["Dibujar por coordenadas", "Dessiner par coordonnées"],
  ["Circle by radius", "Cercle par rayon"],
  ["Guardar geocerca", "Enregistrer la géofence"],
  ["Mostrar en mapa", "Afficher sur la carte"],
  ["Eliminar seleccionadas", "Supprimer la sélection"],
  ["Limpiar mapa", "Effacer la carte"],
  ["Select, show or delete geofences without taking the map off screen.", "Sélectionnez, affichez ou supprimez des géofences sans quitter la carte."],
  ["Ocultar todas", "Tout masquer"],
  ["Próximamente podrás ver aquí el listado de geocercas existentes y sus detalles. Por ahora, usa la opción de Nueva geocerca para crear y editar.", "Vous pourrez bientôt voir ici la liste des géofences existantes et leurs détails. Pour l’instant, utilisez l’option Nouvelle géofence pour créer et modifier."],
  ["Crea una nueva geocerca en el mapa y asígnala a tu personal o actividades.", "Créez une nouvelle géofence sur la carte et assignez-la à votre personnel ou à vos activités."],
  ["Ir a Nueva geocerca →", "Aller à Nouvelle géofence →"],
  ["Dibuja una geocerca o crea una por coordenadas antes de guardar.", "Dessinez une géofence ou créez-en une par coordonnées avant d’enregistrer."],
]);

function walk(value) {
  if (Array.isArray(value)) return value.map(walk);
  if (value && typeof value === "object") {
    for (const key of Object.keys(value)) value[key] = walk(value[key]);
    return value;
  }
  if (typeof value === "string" && exact.has(value)) return exact.get(value);
  return value;
}

function setPath(obj, path, value) {
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!cur[parts[i]] || typeof cur[parts[i]] !== "object") cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

walk(data);

setPath(data, "geocercas.new.title", "Nouvelle géofence");
setPath(data, "geocercas.new.subtitle", "Dessinez une géofence sur la carte et assignez-la à votre personnel ou à vos activités.");
setPath(data, "geocercas.new.placeholderName", "Nom de la zone");
setPath(data, "geocercas.new.buttonDrawByCoords", "Dessiner par coordonnées");
setPath(data, "geocercas.new.buttonCircleByRadius", "Cercle par rayon");
setPath(data, "geocercas.new.buttonSave", "Enregistrer la géofence");

setPath(data, "geocercas.buttonClearCanvas", "Effacer la carte");
setPath(data, "geocercas.buttonDeleteSelected", "Supprimer la sélection");
setPath(data, "geocercas.buttonDrawByCoords", "Dessiner par coordonnées");
setPath(data, "geocercas.buttonSave", "Enregistrer la géofence");
setPath(data, "geocercas.buttonShowOnMap", "Afficher sur la carte");
setPath(data, "geocercas.cardNewTitle", "Nouvelle géofence");
setPath(data, "geocercas.cardNewBody", "Créez une nouvelle géofence sur la carte et assignez-la à votre personnel ou à vos activités.");
setPath(data, "geocercas.cardNewCta", "Aller à Nouvelle géofence →");
setPath(data, "geocercas.subtitleNew", "Dessinez une géofence sur la carte et assignez-la à votre personnel ou à vos activités.");
setPath(data, "geocercas.titleNew", "Nouvelle géofence");

fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");
JSON.parse(fs.readFileSync(file, "utf8"));
console.log("fr.json geocercas translations fixed");
