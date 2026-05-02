const fs = require("fs");

const file = "src/i18n/en.json";
const raw = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
const data = JSON.parse(raw);

function setPath(obj, path, value) {
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!cur[parts[i]] || typeof cur[parts[i]] !== "object") cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

setPath(data, "geocercas.new.title", "New geofence");
setPath(data, "geocercas.new.subtitle", "Draw a geofence on the map and assign it to your staff or activities.");
setPath(data, "geocercas.new.placeholderName", "Zone name");
setPath(data, "geocercas.new.buttonDrawByCoords", "Draw by coordinates");
setPath(data, "geocercas.new.buttonCircleByRadius", "Circle by radius");
setPath(data, "geocercas.new.buttonSave", "Save geofence");

setPath(data, "geocercas.buttonClearCanvas", "Clear map");
setPath(data, "geocercas.buttonDeleteSelected", "Delete selected");
setPath(data, "geocercas.buttonDrawByCoords", "Draw by coordinates");
setPath(data, "geocercas.buttonSave", "Save geofence");
setPath(data, "geocercas.buttonShowOnMap", "Show on map");
setPath(data, "geocercas.cardNewTitle", "New geofence");
setPath(data, "geocercas.cardNewBody", "Create a new geofence on the map and assign it to your staff or activities.");
setPath(data, "geocercas.cardNewCta", "Go to New geofence →");
setPath(data, "geocercas.subtitleNew", "Draw a geofence on the map and assign it to your staff or activities.");
setPath(data, "geocercas.titleNew", "New geofence");

fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");
JSON.parse(fs.readFileSync(file, "utf8"));
console.log("en.json geocercas translations fixed");
