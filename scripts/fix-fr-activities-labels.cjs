const fs = require("fs");

const file = "src/i18n/fr.json";
const raw = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
const data = JSON.parse(raw);

data.actividades = data.actividades || {};

Object.assign(data.actividades, {
  title: "Activités",
  subtitle: "Catalogue des activités avec coût horaire.",

  fieldName: "Nom",
  fieldNameLabel: "Nom",
  fieldNamePlaceholder: "Ex. Semis, Irrigation, Récolte",

  fieldHourlyRateLabel: "Coût horaire",

  fieldCurrency: "Devise",
  fieldCurrencyLabel: "Devise",

  fieldDescription: "Description (facultative)",
  fieldDescriptionLabel: "Description (facultative)",
  fieldDescriptionOptional: "Description (facultative)",
  fieldDescriptionPlaceholder: "Description courte de l’activité...",

  buttonCreate: "Créer une activité",
  buttonSave: "Enregistrer les modifications",

  actionEdit: "Modifier",
  actionActivate: "Activer",
  actionDeactivate: "Désactiver",
  actionDelete: "Supprimer",

  statusActive: "Active",
  statusInactive: "Inactive",
  perHour: "par heure",

  errorRateInvalid: "Saisissez un coût horaire valide.",
  errorRatePositive: "Le coût horaire doit être supérieur à 0."
});

fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");
JSON.parse(fs.readFileSync(file, "utf8"));
console.log("fr.json actividades fixed");
