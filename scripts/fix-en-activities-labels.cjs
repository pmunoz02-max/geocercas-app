const fs = require("fs");

const file = "src/i18n/en.json";
const raw = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
const data = JSON.parse(raw);

data.actividades = data.actividades || {};

Object.assign(data.actividades, {
  title: "Activities",
  subtitle: "Activity catalog with hourly cost.",

  fieldName: "Name",
  fieldNameLabel: "Name",
  fieldNamePlaceholder: "E.g. Sowing, Irrigation, Harvest",

  fieldHourlyRateLabel: "Hourly cost",

  fieldCurrency: "Currency",
  fieldCurrencyLabel: "Currency",

  fieldDescription: "Description",
  fieldDescriptionLabel: "Description (optional)",
  fieldDescriptionOptional: "Description (optional)",
  fieldDescriptionPlaceholder: "Brief description of the activity...",

  buttonCreate: "Create activity",
  buttonSave: "Save changes",

  actionEdit: "Edit",
  actionActivate: "Activate",
  actionDeactivate: "Deactivate",
  actionDelete: "Delete",

  statusActive: "Active",
  statusInactive: "Inactive",
  perHour: "per hour",

  errorRateInvalid: "Enter a valid hourly cost.",
  errorRatePositive: "The hourly cost must be greater than 0."
});

data.currencies = data.currencies || {};
Object.assign(data.currencies, {
  USD: "US dollar",
  CAD: "Canadian dollar",
  BRL: "Brazilian real"
});

fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");
JSON.parse(fs.readFileSync(file, "utf8"));
console.log("en.json actividades fixed");
