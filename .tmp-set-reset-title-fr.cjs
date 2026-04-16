const fs = require("fs");
const p = "src/i18n/fr.json";
const json = JSON.parse(fs.readFileSync(p, "utf8"));
const current = json?.resetPassword?.title;
console.log("CURRENT=" + String(current));
if (current !== "Réinitialiser le mot de passe") {
  json.resetPassword.title = "Réinitialiser le mot de passe";
  fs.writeFileSync(p, JSON.stringify(json, null, 2) + "\n", "utf8");
  console.log("UPDATED=1");
} else {
  console.log("UPDATED=0");
}
