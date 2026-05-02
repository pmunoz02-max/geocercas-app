const fs = require("fs");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");
  JSON.parse(fs.readFileSync(file, "utf8"));
}

const frFile = "src/i18n/fr.json";
const fr = readJson(frFile);

fr.personal = fr.personal || {};

Object.assign(fr.personal, {
  title: "Personnel",
  buttonNew: "Nouveau",
  buttonRefresh: "Actualiser",
  upgrade: "Mettre à niveau 🚀",
  upgradeNow: "Mettre à niveau maintenant",

  roleLabel: "Rôle :",
  onlyActive: "Actifs uniquement",
  searchPlaceholder: "Rechercher par prénom, nom, e-mail ou téléphone…",

  fieldActive: "Actif",
  fieldEmail: "E-mail",
  fieldLastName: "Nom de famille",
  fieldName: "Prénom",
  fieldPhonePlaceholder: "Téléphone (+593…)",
  formTitleNew: "Nouveau membre du personnel",

  active: "Actif",
  email: "E-mail",
  firstName: "Prénom",
  lastName: "Nom de famille",
  phone: "Téléphone",

  tableActive: "Actif",
  tableEmail: "E-mail",
  tableLastName: "Nom de famille",
  tableName: "Prénom",
  tablePhone: "Téléphone",
  actions: "Actions",

  noActive: "Aucun personnel actif.",
  usedLimit: "{{used}} sur {{limit}} utilisés"
});

writeJson(frFile, fr);

// Patch mínimo de textos visibles hardcodeados en src/pages/Personal.jsx
const personalFile = "src/pages/Personal.jsx";
let src = fs.readFileSync(personalFile, "utf8");

src = src
  .replace(/Upgrade ahora/g, '{t("personal.upgradeNow", { defaultValue: "Upgrade now" })}')
  .replace(/Upgrade 🚀/g, '{t("personal.upgrade", { defaultValue: "Upgrade 🚀" })}')
  .replace(/\+ Nuevo/g, '{t("personal.buttonNew", { defaultValue: "+ New" })}');

fs.writeFileSync(personalFile, src, "utf8");

console.log("FR personal translations fixed");
